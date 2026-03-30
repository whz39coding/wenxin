from __future__ import annotations

from dataclasses import dataclass
import importlib
import json
import os
from pathlib import Path
import re
from typing import Any, Callable, Optional
from sqlalchemy import text
from sqlalchemy.engine import Engine

from langchain_openai import ChatOpenAI

from config import config
from core.logger import get_logger


logger = get_logger(__name__)

# 检索命中的一条记录


@dataclass
class SearchHit:
    source: str
    original: str
    translation: str
    chapter: str
    score: float

# 定义查询结果模型


@dataclass
class SearchResult:
    query: str
    answer: str
    references: list[str]
    model: str
    results: list[SearchHit]


class SearchService:
    def __init__(
        self,
        chroma_client: Any,
        mysql_engine: Engine | None,
        embedding_model_name: str,
        collection_prefix: str,
        prompt_file_path: str,
        translate_prompt_file_path: str,
        top_k: int,
    ) -> None:
        self.chroma_client = chroma_client
        self.mysql_engine = mysql_engine
        self.embedding_model_name = embedding_model_name
        self.collection_prefix = collection_prefix
        self.prompt_file_path = Path(prompt_file_path)
        self.translate_prompt_file_path = Path(translate_prompt_file_path)
        self.top_k = max(top_k, 1)
        self._encoder = None
        self._prompt_template: str | None = None
        self._translate_prompt_template: str | None = None

    # 根据问题检索向量库,调用LLM 进行答案生成返回结果
    def search(self, user_id: int, query: str) -> SearchResult:
        question = (query or "").strip()
        if not question:
            logger.warning("query 不能为空")
            raise ValueError("query 不能为空")

        collection_name = f"{self.collection_prefix}_{user_id}"
        try:
            collection = self.chroma_client.get_collection(
                name=collection_name)
        except Exception as exc:
            logger.error("未找到知识库索引，请先完成 OCR 入库")
            raise ValueError("未找到知识库索引，请先完成 OCR 入库") from exc

        # 对问题进行编码
        query_vector = self._get_encoder().encode(
            [question], normalize_embeddings=True
        )[0].tolist()

        # 从向量库中进行检索与问题相关的章句
        retrieved = collection.query(
            query_embeddings=[query_vector],
            n_results=self.top_k,
            include=["documents", "metadatas", "distances"],
        )

        # 只是取第一个 query 的结果, 但里面仍然有 top_k 条文档: [doc1,doc2,doc3],[meta1,meta2,meta3]
        docs = (retrieved.get("documents") or [[]])[0]
        metas = (retrieved.get("metadatas") or [[]])[0]
        distances = (retrieved.get("distances") or [[]])[0]

        hits: list[SearchHit] = []
        for index, document in enumerate(docs):
            metadata = metas[index] if index < len(metas) else {}
            distance = distances[index] if index < len(distances) else 1.0
            hits.append(self._to_searchhit(document, metadata or {}, distance))

        if not hits:
            logger.warning("未检索到相关章句")
        else:
            logger.info("检索到 %d 条结果", len(hits))

        runtime = self._load_user_search_preferences(user_id)

        # 先用问答模型生成答案
        answer, answer_model = self._answer_with_llm(
            question, hits, runtime)

        # 再用翻译模型补全缺失译文
        translation_mapping, translate_model = self._translate_with_llm(
            hits, runtime)

        # 根据 LLM 返回的翻译映射更新 hits
        for idx, translation in translation_mapping.items():
            if 0 <= idx < len(hits):
                hits[idx].translation = translation

        references = self._build_references(hits)

        return SearchResult(
            query=question,
            answer=answer,
            references=references,
            model=f"answer:{answer_model}; translate:{translate_model}",
            results=hits,
        )

    def search_with_progress(
        self,
        user_id: int,
        query: str,
        on_progress: Callable[[str, dict[str, Any]], None]
    ) -> SearchResult:
        """
        支持进度回调的搜索方法。

        参数:
            user_id: 用户ID
            query: 搜索查询
            on_progress: 进度回调函数，接收(event_type: str, data: dict)

        进度事件类型:
            - "encoding": 正在编码问题
            - "retrieving": 正在检索相关章句  
            - "retrieved": 已检索完成 {"count": N}
            - "calling_llm": 正在调用大模型思考
            - "completed": 完成 {"success": true}
            - "error": 发生错误 {"error": str}
        """
        try:
            question = (query or "").strip()
            if not question:
                logger.warning("query 不能为空")
                on_progress("error", {"error": "查询不能为空"})
                raise ValueError("query 不能为空")

            collection_name = f"{self.collection_prefix}_{user_id}"
            try:
                collection = self.chroma_client.get_collection(
                    name=collection_name)
            except Exception as exc:
                logger.error("未找到知识库索引，请先完成 OCR 入库")
                on_progress("error", {"error": "未找到知识库索引，请先完成 OCR 入库"})
                raise ValueError("未找到知识库索引，请先完成 OCR 入库") from exc

            # 正在编码问题
            on_progress("encoding", {"message": "正在分析问题..."})
            query_vector = self._get_encoder().encode(
                [question], normalize_embeddings=True
            )[0].tolist()

            # 正在检索
            on_progress("retrieving", {"message": "正在检索相关章句..."})
            retrieved = collection.query(
                query_embeddings=[query_vector],
                n_results=self.top_k,
                include=["documents", "metadatas", "distances"],
            )

            docs = (retrieved.get("documents") or [[]])[0]
            metas = (retrieved.get("metadatas") or [[]])[0]
            distances = (retrieved.get("distances") or [[]])[0]

            hits: list[SearchHit] = []
            for index, document in enumerate(docs):
                metadata = metas[index] if index < len(metas) else {}
                distance = distances[index] if index < len(distances) else 1.0
                hits.append(self._to_searchhit(
                    document, metadata or {}, distance))

            # 检索完成
            count = len(hits)
            on_progress("retrieved", {"count": count,
                        "message": f"已检索到 {count} 条相关内容"})

            if not hits:
                logger.warning("未检索到相关章句")

            runtime = self._load_user_search_preferences(user_id)

            # 问答阶段
            on_progress("answering", {"message": "正在生成答复..."})
            answer, answer_model = self._answer_with_llm(
                question, hits, runtime)

            # 翻译阶段
            on_progress("translating", {"message": "正在补全白话今释..."})
            translation_mapping, translate_model = self._translate_with_llm(
                hits, runtime)

            # 根据 LLM 返回的翻译映射更新 hits
            for idx, translation in translation_mapping.items():
                if 0 <= idx < len(hits):
                    hits[idx].translation = translation

            references = self._build_references(hits)

            result = SearchResult(
                query=question,
                answer=answer,
                references=references,
                model=f"answer:{answer_model}; translate:{translate_model}",
                results=hits,
            )

            # 完成
            on_progress("translated", {"count": len(
                translation_mapping), "message": f"已补全 {len(translation_mapping)} 条译文"})
            on_progress("completed", {"message": "已完成"})

            return result

        except Exception as exc:
            logger.error(f"搜索失败: {exc}")
            on_progress("error", {"error": str(exc)})
            raise

    def _answer_with_llm(self, question: str, hits: list[SearchHit], runtime: dict[str, str]) -> tuple[str, str]:
        """使用问答模型生成答案正文。"""
        api_key = runtime.get("api_key") or config.open_api_key
        model_name = runtime.get("model") or config.open_api_model
        base_url = runtime.get("base_url") or config.open_api_url
        prompt_override = runtime.get("answer_prompt") or ""

        if self._is_placeholder(api_key):
            logger.error("未配置 OpenAI API Key，请配置后重试")
            return self._fallback_answer(question, hits, reason="missing-key"), "retrieval-only"

        context_text = self._build_context_text(
            hits, include_missing_tag=False)
        prompt_template = prompt_override.strip() or self._load_prompt_template()
        full_prompt = prompt_template.format(
            query=question, context=context_text)

        try:
            llm = ChatOpenAI(
                api_key=api_key,
                base_url=base_url,
                model=model_name,
            )
            response = llm.invoke(full_prompt)
            content = response.content if isinstance(
                response.content, str) else ""
            content = content.strip()
            if not content:
                logger.warning("问答模型回复为空，回退检索模式")
                return self._fallback_answer(question, hits, reason="empty-response"), "retrieval-only"
            return content, model_name
        except Exception as exc:
            logger.error("问答模型调用失败，回退检索模式: %s", exc)
            return self._fallback_answer(question, hits, reason="invoke-failed"), "retrieval-only"

    def _translate_with_llm(self, hits: list[SearchHit], runtime: dict[str, str]) -> tuple[dict[int, str], str]:
        """使用翻译模型仅补全缺失译文，返回 {0-based 索引: 译文}。"""
        missing: list[tuple[int, SearchHit]] = [
            (idx, hit)
            for idx, hit in enumerate(hits)
            if not (hit.translation or "").strip()
        ]
        if not missing:
            return {}, "no-missing"

        api_key = runtime.get("api_key") or config.open_api_key
        translate_model = runtime.get(
            "model") or config.open_translate_api_model
        base_url = runtime.get("base_url") or config.open_api_url

        if self._is_placeholder(api_key):
            logger.warning("未配置 API Key，跳过翻译补全")
            return {}, "retrieval-only"

        translate_prompt = self._load_translate_prompt_template()
        lines: list[str] = []
        for idx, hit in missing:
            lines.append(
                f"[{idx + 1}] source={hit.source}; chapter={hit.chapter}; original={hit.original}; translation=(待翻译)"
            )
        full_prompt = translate_prompt.format(context="\n".join(lines))

        try:
            llm = ChatOpenAI(
                api_key=api_key,
                base_url=base_url,
                model=translate_model,
            )
            response = llm.invoke(full_prompt)
            content = response.content if isinstance(
                response.content, str) else ""
            mapping = self._parse_translation_text((content or "").strip())
            return mapping, translate_model
        except Exception as exc:
            logger.error("翻译模型调用失败: %s", exc)
            return {}, "translate-failed"

    def _load_user_search_preferences(self, user_id: int) -> dict[str, str]:
        if self.mysql_engine is None:
            return {}
        statement = text(
            """
            SELECT api_key, model, base_url, answer_model, answer_prompt
            FROM user_search_settings
            WHERE user_id = :user_id
            LIMIT 1
            """
        )
        with self.mysql_engine.begin() as conn:
            row = conn.execute(
                statement, {"user_id": user_id}).mappings().first()
        if row is None:
            return {}
        return {
            "api_key": str(row.get("api_key") or "").strip(),
            "model": str(row.get("model") or row.get("answer_model") or "").strip(),
            "base_url": str(row.get("base_url") or "").strip(),
            "answer_prompt": str(row.get("answer_prompt") or ""),
        }

    @staticmethod
    def _parse_answer_and_translations(content: str) -> tuple[str, dict[int, str]]:
        """
        从 LLM 响应中提取答案和翻译。

        LLM 返回格式：
        [答案内容：三段结构]
        翻译文本:
        [1]：...
        [2]：...

        策略：
        1. 优先查找"翻译文本:"标记
        2. 如果找到，提取翻译部分，从答案中移除
        3. 解析翻译部分生成翻译映射
        """
        answer = (content or "").strip()
        if not answer:
            return "", {}

        # 先尝试按“翻译标记”切分答案和翻译块。
        marker_pattern = re.compile(
            r"(翻译文本\s*[：:]|翻译补充\s*[：:]|【翻译】|现代汉语翻译\s*[：:]|补充翻译\s*[：:])"
        )
        marker_match = marker_pattern.search(answer)
        if marker_match:
            answer_part = answer[:marker_match.start()].strip()
            translation_part = answer[marker_match.end():].strip()
            mapping = SearchService._parse_translation_text(translation_part)
            if mapping:
                return answer_part, mapping

        # 未命中显式标记时，查找第一条翻译项起点并切分。
        first_item_pattern = re.compile(
            r"(?m)^\s*(?:\[\s*\d+\s*\]|【\s*\d+\s*】|第\s*\d+\s*条|\(\s*\d+\s*[)）])\s*[：:]"
        )
        first_item_match = first_item_pattern.search(answer)
        if first_item_match:
            answer_part = answer[:first_item_match.start()].strip()
            translation_part = answer[first_item_match.start():].strip()
            mapping = SearchService._parse_translation_text(translation_part)
            if mapping:
                return answer_part, mapping

        # 最后兜底：从整段文本中提取翻译映射（不改动答案正文）。
        translation_mapping = SearchService._extract_translations_from_text(
            answer)
        return answer, translation_mapping

    @staticmethod
    def _parse_translation_text(trans_text: str) -> dict[int, str]:
        """
        解析翻译文本部分。
        支持格式：
        [1]：翻译1
        [2]：翻译2
        或其他支持的格式
        """
        translation_mapping: dict[int, str] = {}
        if not trans_text:
            return translation_mapping

        item_pattern = re.compile(
            r"(?ms)^\s*(?:"
            r"\[\s*(?P<idx1>\d+)\s*\]"
            r"|【\s*(?P<idx2>\d+)\s*】"
            r"|第\s*(?P<idx3>\d+)\s*条"
            r"|\(\s*(?P<idx4>\d+)\s*[)）]"
            r")\s*[：:]\s*(?P<trans>.*?)\s*"
            r"(?=^\s*(?:\[\s*\d+\s*\]|【\s*\d+\s*】|第\s*\d+\s*条|\(\s*\d+\s*[)）])\s*[：:]|\Z)"
        )

        for m in item_pattern.finditer(trans_text):
            idx_text = m.group("idx1") or m.group(
                "idx2") or m.group("idx3") or m.group("idx4")
            trans = (m.group("trans") or "").strip()
            if not idx_text or not trans:
                continue
            translation_mapping[int(idx_text) - 1] = trans

        return translation_mapping

    @staticmethod
    def _extract_translations_from_text(text: str) -> dict[int, str]:
        """
        从自由格式的文本中提取翻译映射。
        支持多种格式：
        - [1]：...[2]：...  (配对格式)
        - 【1】...【2】...  (方括号格式)
        - 第1条：...第2条：...  (序号格式)
        """
        return SearchService._parse_translation_text(text)

    @staticmethod
    def _repair_json_translations(json_str: str) -> str:
        """
        尝试修复 LLM 生成的不规范 JSON。
        主要处理翻译文本中的未转义引号问题。
        """
        # 使用正则表达式提取每个翻译对象
        # 匹配 {"index": N, "translation": "..."} 的各种变体
        pattern = r'\{\s*"index"\s*:\s*(\d+)\s*,\s*"translation"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}'

        matches = re.findall(pattern, json_str)
        if matches:
            # 重构为规范的 JSON 数组
            items = []
            for idx, trans in matches:
                # 确保翻译文本中的特殊字符被正确转义
                trans_escaped = trans.replace('\\', '\\\\').replace(
                    '"', '\\"').replace('\n', '\\n')
                items.append({
                    "index": int(idx),
                    "translation": trans_escaped
                })
            return json.dumps(items, ensure_ascii=False)

        # 如果正则匹配失败，返回原字符串让其他处理接手
        return json_str

    @staticmethod
    def _build_context_text(hits: list[SearchHit], include_missing_tag: bool) -> str:
        lines: list[str] = []
        for idx, hit in enumerate(hits, start=1):
            source_tag = f"[{idx}]"
            if include_missing_tag and not (hit.translation or "").strip():
                source_tag += " [缺译]"
            lines.append(
                f"{source_tag} source={hit.source}; chapter={hit.chapter}; original={hit.original}; translation={hit.translation or '(待翻译)'}"
            )
        return "\n".join(lines)

    # 加载 Prompt
    def _load_prompt_template(self) -> str:
        if self._prompt_template is not None:
            return self._prompt_template

        if not self.prompt_file_path.exists():
            logger.warning("未找到 Prompt 文件 ")
            raise RuntimeError(f"Prompt 文件不存在: {self.prompt_file_path}")

        template = self.prompt_file_path.read_text(encoding="utf-8").strip()
        if not template:
            logger.warning("Prompt 文件为空，请补充提示词")
            raise RuntimeError("Prompt 文件为空，请补充提示词")

        self._prompt_template = template
        logger.info("加载 Prompt 文件成功")
        return template

    def _load_translate_prompt_template(self) -> str:
        if self._translate_prompt_template is not None:
            return self._translate_prompt_template

        if not self.translate_prompt_file_path.exists():
            logger.warning("未找到翻译 Prompt 文件，使用默认模板")
            self._translate_prompt_template = (
                "你是古文翻译助手。请仅翻译以下待翻译条目，严格输出格式：\n"
                "[1]：译文\n[2]：译文\n"
                "不要输出额外说明。\n\n"
                "待翻译上下文：\n{context}"
            )
            return self._translate_prompt_template

        template = self.translate_prompt_file_path.read_text(
            encoding="utf-8").strip()
        if not template:
            logger.warning("翻译 Prompt 文件为空，使用默认模板")
            self._translate_prompt_template = (
                "你是古文翻译助手。请仅翻译以下待翻译条目，严格输出格式：\n"
                "[1]：译文\n[2]：译文\n"
                "不要输出额外说明。\n\n"
                "待翻译上下文：\n{context}"
            )
            return self._translate_prompt_template

        self._translate_prompt_template = template
        logger.info("加载翻译 Prompt 文件成功")
        return template

   # 将从向量库中检索得到的记录转为SearchHit类型
    @staticmethod
    def _to_searchhit(document: str, metadata: dict[str, Any], distance: Any) -> SearchHit:
        source = (
            str(
                metadata.get("book_title")
                or "未知来源"
            )
        ).strip()
        chapter = (
            str(
                metadata.get("chapter")
                or metadata.get("section_index")
                or metadata.get("juan")
                or "未标注篇章"
            )
        ).strip()
        original = str(metadata.get("raw_sentence") or "未知当前句???").strip()
        translation = str(
            metadata.get("translation")
            or metadata.get("modern_translation")
            or ""
        ).strip()

        try:
            score = max(0.0, min(1.0, 1.0 - float(distance)))
        except Exception:
            score = 0.0

        return SearchHit(
            source=source,
            original=original,
            translation=translation,
            chapter=chapter,
            score=score,
        )

    # 从检索结果中提取“书名·章节”的引用来源，并自动去重，生成参考文献列表。
    @staticmethod
    def _build_references(hits: list[SearchHit]) -> list[str]:
        references: list[str] = []
        seen: set[str] = set()
        for hit in hits:
            ref = f"{hit.source}·{hit.chapter}"
            if ref not in seen:
                seen.add(ref)
                references.append(ref)
        return references

    # 未配置 API Key 时,只具有检索功能,回答检索到的知识
    @staticmethod
    def _fallback_answer(question: str, hits: list[SearchHit], reason: str = "missing-key") -> str:
        reason_hint = (
            "未配置 API Key" if reason == "missing-key" else "当前 LLM 调用失败"
        )
        if not hits:
            return f"针对问题“{question}”，\n 从知识库中未找到相关章句进行回答,且未配置 API Key\
               无法调用大模型进一步解读（{reason_hint}）,请检查模型配置后重试。"
        best = hits[0]
        return (
            f"针对问题“{question}”，最相关章句为：{best.original}\n"
            f"进入检索回退模式（{reason_hint}），请检查 API Key、Base URL 与模型名配置。"
        )

    # 获取编码器
    def _get_encoder(self):
        if self._encoder is not None:
            return self._encoder

        # 强制离线模式，避免启动时访问 HuggingFace。
        # 注意：使用强制赋值而不是 setdefault，确保生效
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

        try:
            sentence_module = importlib.import_module("sentence_transformers")
            SentenceTransformer = getattr(
                sentence_module, "SentenceTransformer")
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "缺少 sentence-transformers 依赖，请先安装 requirements.txt"
            ) from exc

        self._encoder = SentenceTransformer(
            self.embedding_model_name,
            cache_folder=config.embedding_model_path,
            local_files_only=True,
        )
        return self._encoder

    # 检查是不是填充了
    @staticmethod
    def _is_placeholder(value: str) -> bool:
        check = (value or "").upper()
        return "YOUR_" in check or "PLACEHOLDER" in check or not value.strip()
