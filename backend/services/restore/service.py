from __future__ import annotations

from dataclasses import dataclass
import importlib
import json
import os
from pathlib import Path
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from langchain_openai import ChatOpenAI

from config.settings import config
from core.logger import get_logger


logger = get_logger(__name__)


@dataclass
class RestoreHit:
    source: str
    chapter: str
    original: str
    score: float


@dataclass
class RestoreSegment:
    text: str
    restored: bool


@dataclass
class RestoreResult:
    input_text: str
    restored_text: str
    restored_segments: list[RestoreSegment]
    evidence: list[str]
    explanation: str
    model: str


class RestoreService:
    def __init__(
        self,
        chroma_client: Any,
        mysql_engine: Engine | None,
        embedding_model_name: str,
        collection_prefix: str,
        prompt_file_path: str,
        top_k: int,
    ) -> None:
        self.chroma_client = chroma_client
        self.mysql_engine = mysql_engine
        self.embedding_model_name = embedding_model_name
        self.collection_prefix = collection_prefix
        self.prompt_file_path = Path(prompt_file_path)
        self.top_k = max(top_k, 1)
        self._encoder = None
        self._prompt_template: str | None = None

    def restore(self, user_id: int, text_value: str) -> RestoreResult:
        raw_text = (text_value or "").strip()
        masked_text = self._normalize_mask_text(raw_text)

        if not masked_text:
            raise ValueError("待补全文本不能为空")
        if "_" not in masked_text:
            raise ValueError("请使用 '_' 标记残缺位置")

        hits = self._retrieve_hits(user_id=user_id, masked_text=masked_text)

        kb_restored = self._restore_with_knowledge(
            masked_text=masked_text, hits=hits)
        if kb_restored is not None:
            evidence = self._build_evidence(hits)
            return RestoreResult(
                input_text=raw_text,
                restored_text=kb_restored,
                restored_segments=self._build_segments(
                    masked_text, kb_restored),
                evidence=evidence,
                explanation=self._build_rag_explanation(evidence),
                model="rag-direct",
            )

        runtime = self._load_user_search_preferences(user_id)
        llm_restored, llm_explanation, model_name = self._restore_with_llm(
            masked_text, hits, runtime)

        if not llm_restored:
            llm_restored = masked_text
            llm_explanation = "未能完成有效补阙，当前返回原始残句，请调整输入或检查模型配置后重试。"
            model_name = "restore-failed"

        evidence = self._build_evidence(hits)
        if not evidence:
            evidence = ["知识库未命中有效章句，本次由大模型直接补全。"]

        return RestoreResult(
            input_text=raw_text,
            restored_text=llm_restored,
            restored_segments=self._build_segments(masked_text, llm_restored),
            evidence=evidence,
            explanation=llm_explanation or self._build_rag_explanation(
                evidence),
            model=model_name,
        )

    def _retrieve_hits(self, user_id: int, masked_text: str) -> list[RestoreHit]:
        collection_name = f"{self.collection_prefix}_{user_id}"
        try:
            collection = self.chroma_client.get_collection(
                name=collection_name)
        except Exception as exc:
            raise ValueError("未找到知识库索引，请先完成 OCR 入库") from exc

        query_text = re.sub(r"_+", " ", masked_text).strip()
        query_vector = self._get_encoder().encode(
            [query_text], normalize_embeddings=True
        )[0].tolist()

        retrieved = collection.query(
            query_embeddings=[query_vector],
            n_results=self.top_k,
            include=["documents", "metadatas", "distances"],
        )

        metas = (retrieved.get("metadatas") or [[]])[0]
        distances = (retrieved.get("distances") or [[]])[0]

        hits: list[RestoreHit] = []
        for idx, metadata in enumerate(metas):
            distance = distances[idx] if idx < len(distances) else 1.0
            hits.append(self._to_restore_hit(metadata or {}, distance))
        return hits

    def _restore_with_knowledge(self, masked_text: str, hits: list[RestoreHit]) -> str | None:
        for hit in hits:
            candidate = (hit.original or "").strip()
            if not candidate:
                continue
            restored = self._try_fill_from_candidate(masked_text, candidate)
            if restored:
                logger.info("补缺命中知识库直接补全: %s", hit.chapter)
                return restored
        return None

    def _restore_with_llm(
        self,
        masked_text: str,
        hits: list[RestoreHit],
        runtime: dict[str, str],
    ) -> tuple[str, str, str]:
        api_key = runtime.get("api_key") or config.open_api_key
        model_name = runtime.get("model") or config.open_api_model
        base_url = runtime.get("base_url") or config.open_api_url

        if self._is_placeholder(api_key):
            logger.warning("未配置 API Key，无法进行补缺大模型兜底")
            return "", "未配置 API Key，无法进行大模型补阙。", "missing-key"

        context_text = self._build_context_text(hits)
        prompt_template = self._load_prompt_template()
        full_prompt = prompt_template.format(
            masked_text=masked_text, context=context_text)
        try:
            llm = ChatOpenAI(
                api_key=api_key, base_url=base_url, model=model_name)
            response = llm.invoke(full_prompt)
            content = response.content if isinstance(
                response.content, str) else ""
            restored, explanation = self._extract_restore_payload(content)
            if not restored:
                return "", "模型未返回有效补全结果。", "empty-response"
            return self._normalize_mask_text(restored), explanation, model_name
        except Exception as exc:
            logger.error("补缺大模型调用失败: %s", exc)
            return "", "模型调用失败，已回退到原始文本。", "invoke-failed"

    @staticmethod
    def _normalize_mask_text(value: str) -> str:
        text_value = (value or "").strip()
        text_value = text_value.replace("□", "_").replace("＿", "_")
        text_value = re.sub(r"\[(?:\s*\.\s*){3}\]", "_", text_value)
        return text_value

    @staticmethod
    def _extract_restore_payload(content: str) -> tuple[str, str]:
        text_value = (content or "").strip()
        if not text_value:
            return "", ""
        text_value = re.sub(r"^```[\w-]*", "",
                            text_value).replace("```", "").strip()

        # 优先解析 JSON 输出
        try:
            data = json.loads(text_value)
            if isinstance(data, dict):
                restored_text = str(data.get("restored_text") or "").strip()
                explanation = str(data.get("explanation") or "").strip()
                return restored_text, explanation
        except Exception:
            pass

        lines = [line.strip()
                 for line in text_value.splitlines() if line.strip()]
        if not lines:
            return "", ""

        restored = ""
        explanation = ""

        for line in lines:
            if "：" in line and ("补全" in line or "结果" in line or "restored" in line.lower()):
                restored = line.split("：", 1)[1].strip()
            elif ":" in line and ("补全" in line or "结果" in line or "restored" in line.lower()):
                restored = line.split(":", 1)[1].strip()
            elif "：" in line and ("解释" in line or "说明" in line or "explanation" in line.lower()):
                explanation = line.split("：", 1)[1].strip()
            elif ":" in line and ("解释" in line or "说明" in line or "explanation" in line.lower()):
                explanation = line.split(":", 1)[1].strip()

        if not restored:
            restored = lines[0]
        return restored, explanation

    @staticmethod
    def _try_fill_from_candidate(masked_text: str, candidate: str) -> str | None:
        tokens = re.split(r"(_+)", masked_text)
        if not any(re.fullmatch(r"_+", token or "") for token in tokens):
            return None

        pattern_parts: list[str] = []
        hole_count = 0
        for token in tokens:
            if re.fullmatch(r"_+", token or ""):
                pattern_parts.append("(.+?)")
                hole_count += 1
            else:
                pattern_parts.append(re.escape(token))

        if hole_count == 0:
            return None

        pattern = "".join(pattern_parts)
        match = re.search(pattern, candidate)
        if match is None:
            return None

        fillings = list(match.groups())
        if len(fillings) != hole_count:
            return None

        fill_index = 0
        rebuilt_parts: list[str] = []
        for token in tokens:
            if re.fullmatch(r"_+", token or ""):
                filled = fillings[fill_index]
                if not filled:
                    return None
                rebuilt_parts.append(filled)
                fill_index += 1
            else:
                rebuilt_parts.append(token)
        return "".join(rebuilt_parts)

    @staticmethod
    def _extract_fillings(masked_text: str, restored_text: str) -> list[str] | None:
        tokens = re.split(r"(_+)", masked_text)
        pattern_parts: list[str] = []
        hole_count = 0
        for token in tokens:
            if re.fullmatch(r"_+", token or ""):
                pattern_parts.append("(.+?)")
                hole_count += 1
            else:
                pattern_parts.append(re.escape(token))

        if hole_count == 0:
            return []

        match = re.search("".join(pattern_parts), restored_text)
        if match is None:
            return None
        groups = list(match.groups())
        if len(groups) != hole_count:
            return None
        return groups

    def _build_segments(self, masked_text: str, restored_text: str) -> list[RestoreSegment]:
        aligned_segments = self._build_segments_with_alignment(
            masked_text=masked_text,
            restored_text=restored_text,
        )
        if aligned_segments is not None:
            return aligned_segments

        tokens = re.split(r"(_+)", masked_text)
        fillings = self._extract_fillings(
            masked_text=masked_text, restored_text=restored_text)
        if fillings is None:
            return [RestoreSegment(text=restored_text, restored=False)]

        segments: list[RestoreSegment] = []
        fill_index = 0
        for token in tokens:
            if re.fullmatch(r"_+", token or ""):
                fill_text = fillings[fill_index] if fill_index < len(
                    fillings) else ""
                if fill_text:
                    segments.append(RestoreSegment(
                        text=fill_text, restored=True))
                fill_index += 1
            else:
                if token:
                    segments.append(RestoreSegment(text=token, restored=False))
        return segments

    @staticmethod
    def _build_segments_with_alignment(masked_text: str, restored_text: str) -> list[RestoreSegment] | None:
        tokens = re.split(r"(_+)", masked_text)
        if not any(re.fullmatch(r"_+", token or "") for token in tokens):
            return [RestoreSegment(text=restored_text, restored=False)]

        segments: list[RestoreSegment] = []
        cursor = 0

        for index, token in enumerate(tokens):
            if re.fullmatch(r"_+", token or ""):
                next_literal = ""
                for lookahead in tokens[index + 1:]:
                    if not re.fullmatch(r"_+", lookahead or "") and lookahead:
                        next_literal = lookahead
                        break

                if next_literal:
                    next_range = RestoreService._find_literal_range(
                        text=restored_text,
                        literal=next_literal,
                        start=cursor,
                    )
                    if next_range is None:
                        return None
                    next_pos = next_range[0]
                    fill_text = restored_text[cursor:next_pos]
                    if fill_text:
                        segments.append(RestoreSegment(
                            text=fill_text, restored=True))
                    cursor = next_pos
                else:
                    fill_text = restored_text[cursor:]
                    if fill_text:
                        segments.append(RestoreSegment(
                            text=fill_text, restored=True))
                    cursor = len(restored_text)
            else:
                if not token:
                    continue
                literal_range = RestoreService._find_literal_range(
                    text=restored_text,
                    literal=token,
                    start=cursor,
                )
                if literal_range is None:
                    return None
                literal_pos, literal_end = literal_range
                if literal_pos > cursor:
                    # 文字漂移时，将无法归属的中间文本作为补全文高亮展示。
                    dangling = restored_text[cursor:literal_pos]
                    if dangling:
                        segments.append(RestoreSegment(
                            text=dangling, restored=True))
                segments.append(
                    RestoreSegment(
                        text=restored_text[literal_pos:literal_end],
                        restored=False,
                    )
                )
                cursor = literal_end

        if cursor < len(restored_text):
            tail = restored_text[cursor:]
            if tail:
                segments.append(RestoreSegment(text=tail, restored=True))

        return segments if segments else [RestoreSegment(text=restored_text, restored=False)]

    @staticmethod
    def _find_literal_range(text: str, literal: str, start: int) -> tuple[int, int] | None:
        if not literal:
            return start, start

        exact_pos = text.find(literal, start)
        if exact_pos >= 0:
            return exact_pos, exact_pos + len(literal)

        normalized_text, text_map = RestoreService._normalize_with_index_map(
            text[start:]
        )
        normalized_literal, _ = RestoreService._normalize_with_index_map(
            literal)
        if not normalized_literal:
            return None

        normalized_pos = normalized_text.find(normalized_literal)
        if normalized_pos < 0:
            return None

        normalized_end = normalized_pos + len(normalized_literal) - 1
        origin_begin = start + text_map[normalized_pos]
        origin_end = start + text_map[normalized_end] + 1
        return origin_begin, origin_end

    @staticmethod
    def _normalize_with_index_map(value: str) -> tuple[str, list[int]]:
        punctuation_map = {
            "，": ",",
            "。": ".",
            "？": "?",
            "！": "!",
            "：": ":",
            "；": ";",
            "（": "(",
            "）": ")",
            "【": "[",
            "】": "]",
            "“": '"',
            "”": '"',
            "‘": "'",
            "’": "'",
            "、": ",",
        }

        normalized_chars: list[str] = []
        index_map: list[int] = []
        for idx, char in enumerate(value):
            if char.isspace():
                continue
            mapped = punctuation_map.get(char, char).lower()
            normalized_chars.append(mapped)
            index_map.append(idx)

        return "".join(normalized_chars), index_map

    @staticmethod
    def _build_context_text(hits: list[RestoreHit]) -> str:
        if not hits:
            return "(未检索到相关章句)"

        lines: list[str] = []
        for idx, hit in enumerate(hits, start=1):
            lines.append(
                f"[{idx}] source={hit.source}; chapter={hit.chapter}; original={hit.original}; score={hit.score:.4f}"
            )
        return "\n".join(lines)

    @staticmethod
    def _build_evidence(hits: list[RestoreHit]) -> list[str]:
        if not hits:
            return []
        best_hit = hits[0]
        return [f"{best_hit.source}·{best_hit.chapter}：{best_hit.original}"]

    @staticmethod
    def _build_rag_explanation(evidence: list[str]) -> str:
        if not evidence:
            return "知识库未命中有效参考，已尝试由大模型直接补全。"
        return f"补阙优先参考了相关性最高的章句：{evidence[0]}"

    def _load_prompt_template(self) -> str:
        if self._prompt_template is not None:
            return self._prompt_template

        if self.prompt_file_path.exists():
            logger.info("使用本地补缺prompt")
            template = self.prompt_file_path.read_text(
                encoding="utf-8").strip()
            if template:
                self._prompt_template = template
                return template

        self._prompt_template = (
            "你是《论语》古文补缺助手。\n"
            "任务：根据输入句子中的下划线 '_' 补全缺失内容。\n"
            "优先参考给定检索上下文，不要编造不存在于上下文的出处信息。\n"
            "如果上下文不足，可结合常识补全最合理版本。\n"
            "仅输出补全后的完整句子，不要输出解释。\n\n"
            "待补全文本：{masked_text}\n"
            "检索上下文：\n{context}"
        )
        return self._prompt_template

    def _load_user_search_preferences(self, user_id: int) -> dict[str, str]:
        if self.mysql_engine is None:
            return {}
        statement = text(
            """
            SELECT api_key, model, base_url, answer_model
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
        }

    @staticmethod
    def _to_restore_hit(metadata: dict[str, Any], distance: Any) -> RestoreHit:
        source = str(metadata.get("book_title") or "未知来源").strip()
        chapter = str(
            metadata.get("chapter")
            or metadata.get("section_index")
            or metadata.get("juan")
            or "未标注篇章"
        ).strip()
        original = str(metadata.get("raw_sentence") or "").strip()

        try:
            score = max(0.0, min(1.0, 1.0 - float(distance)))
        except Exception:
            score = 0.0

        return RestoreHit(source=source, chapter=chapter, original=original, score=score)

    def _get_encoder(self):
        if self._encoder is not None:
            return self._encoder

        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

        try:
            sentence_module = importlib.import_module("sentence_transformers")
            SentenceTransformer = getattr(
                sentence_module, "SentenceTransformer")
        except ImportError as exc:
            raise RuntimeError(
                "缺少 sentence-transformers 依赖，请先安装 requirements.txt"
            ) from exc

        self._encoder = SentenceTransformer(
            self.embedding_model_name,
            cache_folder=config.embedding_model_path,
            local_files_only=True,
        )
        return self._encoder

    @staticmethod
    def _is_placeholder(value: str) -> bool:
        check = (value or "").upper()
        return "YOUR_" in check or "PLACEHOLDER" in check or not value.strip()
