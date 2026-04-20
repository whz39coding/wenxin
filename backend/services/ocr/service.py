from __future__ import annotations

from dataclasses import dataclass
import importlib
from pathlib import Path
from typing import Any
import os
from config import config
from core.logger import get_logger
from utils.classical_parser import ClassicalChineseTokenizer, Document

from services.upload_book import UploadService

logger = get_logger(__name__)

# 定义的数据模型


@dataclass
class OCRResult:
    upload_id: int
    text: str
    model: str  # 模型名称
    chunk_count: int


class OCRService:
    def __init__(
        self,
        upload_service: UploadService,
        chroma_client: Any,
        embedding_model_name: str,
        collection_prefix: str,
    ) -> None:
        self.upload_service = upload_service
        self.chroma_client = chroma_client
        self.embedding_model_name = embedding_model_name
        self.collection_prefix = collection_prefix
        self._encoder = None
        self._rapid_ocr = None
        self._max_image_pixels = config.ocr_max_image_pixels
        self._max_image_width = config.ocr_max_image_width
        self._max_image_height = config.ocr_max_image_height
        self._pdf_render_scale = config.ocr_pdf_render_scale
        self._pdf_max_pages = config.ocr_pdf_max_pages
        self.tok = ClassicalChineseTokenizer(
            min_len=8,
            max_len=60,
            context_before=2,
            context_after=1,
            keep_notes=False,
        )

    # 将传入的未被OCR的文件进行OCR提取文本.
    def recognize_upload(self, user_id: int, upload_id: int) -> OCRResult:
        unocr_ids = {
            item.id for item in self.upload_service.list_unocr_by_user(user_id)
        }  # 获取“尚未 OCR”的记录

        record = self.upload_service.get_by_id(
            upload_id, user_id)  # 从数据库中查到这个未被OCR的文件记录
        if record is None:
            logger.error("OCR调用get_by_id失败")
            raise ValueError("文件不存在或无权访问")

        # 如果这个记录已经被OCR了，则直接返回结果
        if record.id not in unocr_ids and (record.extracted_text or "").strip():
            logger.warning("文件已进行OCR,请检查前端的渲染(搜索结果)")
            text = (record.extracted_text or "").strip()
            # chunks = self._split_text(text)
            chunks = self.tok.split_text(
                text=text, source=upload_id, book_title=record.filename)
            chunks = [chunk.page_content for chunk in chunks]
            # self._index_to_chroma(
            #     user_id=user_id,
            #     upload_id=record.id,
            #     filename=record.filename,
            #     chunks=chunks,
            # )
            return OCRResult(
                upload_id=record.id,
                text=text,
                model="cached-extracted-text",
                chunk_count=len(chunks),
            )

        file_path = self.upload_service.get_file_path(upload_id, user_id)
        if file_path is None:
            logger.error("OCR无法获取文件路径")
            raise FileNotFoundError("文件已损坏或被移除")

        text, ocr_model = self._extract_text(file_path, record.content_type)
        if not text.strip():
            logger.error("OCR提取文本失败")
            raise ValueError("未识别到有效文本，请更换更清晰的文件")

        # 将OCR文本写入数据库
        updated = self.upload_service.set_extracted_text(
            record.id, user_id, text)
        if updated is None:
            logger.error("OCR写入数据库失败")
            raise RuntimeError("写回 OCR 结果失败")

        # 将OCR文本索引加到向量库,为后续问答使用
        chunks = self.tok.split_text(
            text=text, source=upload_id, book_title=record.filename)
        # chunks = [chunk.page_content for chunk in chunks]
        self._index_to_chroma(
            user_id=user_id,
            upload_id=record.id,
            filename=record.filename,
            chunks=chunks,
        )

        return OCRResult(
            upload_id=record.id,
            text=text,
            model=ocr_model,
            chunk_count=len(chunks),
        )
    # 根据文件存储路径，对文件进行OCR识别

    def _extract_text(self, file_path: Path, content_type: str) -> tuple[str, str]:
        if content_type == "application/pdf":
            text = self._extract_pdf_text(file_path)
            if text.strip():  # pdf提取成功
                print("=====pdf text=======")
                print(text)
                print("=====pdf text end=======")
                return text, "pypdf-text-layer"
            # PDF 没有文本层时，回退到按页渲染图片后 OCR。
            logger.warning("PDF文件无文本层，回退到图片页OCR")
            pdf_image_text = self._extract_pdf_image_layer_text(file_path)
            if pdf_image_text.strip():
                return pdf_image_text, "rapidocr-pdf-image-layer"
            raise ValueError("PDF未识别到有效文本，请更换更清晰文件或减少页面内容")
        logger.info(f"文件类型: {content_type}")
        if self._is_text_file(content_type, file_path):
            text = self._extract_plain_text(file_path)
            return text, "plain-text-direct"

        if content_type.startswith("image/"):
            text = self._extract_image_like_text(file_path)
            return text, "rapidocr"

        logger.error(
            f"文件类型超出,无法进行OCR: upload_path={file_path} content_type={content_type}")
        raise ValueError(f"当前文件类型暂不支持识文: {content_type}")

    @staticmethod
    def _is_text_file(content_type: str, file_path: Path) -> bool:
        normalized = (content_type or "").strip().lower()
        if normalized == "text/plain":
            return True
        # 某些浏览器或文件夹上传时会给 txt 标记成 application/octet-stream
        if file_path.suffix.lower() == ".txt" and normalized in {"", "application/octet-stream", "text/plain"}:
            return True
        return False

    def _extract_plain_text(self, file_path: Path) -> str:
        try:
            raw = file_path.read_bytes()
        except Exception as exc:
            raise RuntimeError(f"读取 TXT 文件失败: {exc}") from exc

        if not raw:
            return ""

        # 先尝试常见编码，失败后使用 chardet 兜底识别。
        preferred_encodings = ["utf-8-sig", "utf-8", "gb18030", "gbk", "big5"]
        for encoding in preferred_encodings:
            try:
                text = raw.decode(encoding)
                logger.info("TXT 读取成功，编码=%s", encoding)
                return self._normalize_layout_text(text)
            except UnicodeDecodeError:
                continue

        try:
            chardet_module = importlib.import_module("chardet")
            detected = chardet_module.detect(raw)
            detected_encoding = str(detected.get("encoding") or "").strip()
            if detected_encoding:
                text = raw.decode(detected_encoding, errors="replace")
                logger.info("TXT 读取成功，chardet编码=%s", detected_encoding)
                return self._normalize_layout_text(text)
        except Exception as exc:
            logger.warning("TXT 编码识别失败，回退 replace 解码: %s", exc)

        text = raw.decode("utf-8", errors="replace")
        logger.warning("TXT 使用 utf-8 replace 解码")
        return self._normalize_layout_text(text)
    # 对pdf格式的文件进行OCR识别

    def _extract_pdf_text(self, file_path: Path) -> str:
        try:
            pdf_module = importlib.import_module("pypdf")
            PdfReader = getattr(pdf_module, "PdfReader")
        except ImportError as exc:
            logger.error("对pdf文件进行OCR时,缺少 pypdf 模块")
            raise RuntimeError("缺少 pypdf 依赖，请先安装 requirements.txt") from exc

        reader = PdfReader(str(file_path))
        pages: list[str] = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        logger.info(f"成功提取pdf文件文本: {len(pages)} 页")
        return self._normalize_layout_text("\n".join(pages))

    def _extract_pdf_image_layer_text(self, file_path: Path) -> str:
        try:
            pdfium_module = importlib.import_module("pypdfium2")
        except ImportError as exc:
            raise RuntimeError(
                "缺少 pypdfium2 依赖，无法对图片型 PDF 进行 OCR"
            ) from exc

        document = pdfium_module.PdfDocument(str(file_path))
        page_count = len(document)
        if page_count == 0:
            return ""

        if page_count > self._pdf_max_pages:
            raise ValueError(
                f"PDF页数过多（{page_count}页），请拆分后再识别（最多 {self._pdf_max_pages} 页）"
            )

        texts: list[str] = []
        for index in range(page_count):
            page = document[index]
            page_no = index + 1

            width_px, height_px = self._estimate_pdf_page_pixels(
                page=page,
                scale=self._pdf_render_scale,
            )
            print(f"PDF第{page_no}页分辨率: {width_px}x{height_px}")
            self._ensure_image_safe(
                width=width_px,
                height=height_px,
                source=f"PDF第{page_no}页",
            )

            try:
                bitmap = page.render(scale=self._pdf_render_scale)
                page_image = bitmap.to_numpy()
            except Exception as exc:
                raise RuntimeError(f"PDF第{page_no}页渲染失败: {exc}") from exc

            page_text = self._extract_image_array_text(
                image_array=page_image,
                source=f"PDF第{page_no}页",
            )
            if page_text.strip():
                texts.append(page_text)

        logger.info("图片型PDF OCR完成，共识别 %d/%d 页", len(texts), page_count)
        return self._normalize_layout_text("\n".join(texts))

    def _estimate_pdf_page_pixels(self, page: Any, scale: float) -> tuple[int, int]:
        try:
            width_pt, height_pt = page.get_size()
            width_px = max(1, int(float(width_pt) * float(scale)))
            height_px = max(1, int(float(height_pt) * float(scale)))
            return width_px, height_px
        except Exception:
            # 如果无法预估尺寸，返回保守值让后续渲染后再校验。
            fallback_side = int(1000 * max(1.0, scale))
            return fallback_side, fallback_side

    @staticmethod
    def _is_isolated_punctuation(line: str) -> bool:
        """检测行是否只包含孤立的引号、括号等标点"""
        if not line:
            return False
        # 允许的孤立符号集合
        allowed = set('""\'\'""\'\'()（）【】《》[]{}、，；：')
        return all(ch in allowed for ch in line)

    @staticmethod
    def _normalize_layout_text(text: str) -> str:
        # PDF 文本层和图片 OCR 都可能按版式硬换行，这里尽量合并"软换行"。
        lines = [line.strip() for line in text.replace("\r", "\n").split("\n")]
        cleaned = [line for line in lines if line]
        if not cleaned:
            return ""

        merged: list[str] = [cleaned[0]]
        for line in cleaned[1:]:
            prev = merged[-1]
            # 如果当前行只包含孤立标点，强制和前一行合并
            if OCRService._is_isolated_punctuation(line):
                merged[-1] = prev + line
            elif OCRService._should_join_layout_line(prev, line):
                merged[-1] = prev + line
            else:
                merged.append(line)
        return "\n".join(merged)

    @staticmethod
    def _postprocess_ocr_text(text: str) -> str:
        """对 OCR 易错词做轻量纠正。"""
        normalized = text or ""
        # 论语常见误识别：子曰 -> 子日
        normalized = normalized.replace("子日", "子曰")
        return normalized

    @staticmethod
    def _should_join_layout_line(prev: str, curr: str) -> bool:
        if not prev or not curr:
            return False

        end_ch = prev[-1]
        begin_ch = curr[0]

        # 遇到句末强标点，通常保留换行。
        strong_endings = set("。！？!?；;”’」』》）】")
        if end_ch in strong_endings:
            return False

        # 行首是收尾类标点，通常说明上一行被截断。
        if begin_ch in set("，。！？!?；;、：:）】》」』”’"):
            return True

        # 两侧均为正文字符时，多为版式换行导致的断句。
        return OCRService._is_body_char(end_ch) and OCRService._is_body_char(begin_ch)

    @staticmethod
    def _is_body_char(ch: str) -> bool:
        return ch.isalnum() or "\u4e00" <= ch <= "\u9fff"

    @staticmethod
    def _extract_text_from_rapid_result_item(item: Any) -> str | None:
        """兼容 rapidocr_onnxruntime 常见输出结构，尽量提取文本字段。"""
        if item is None:
            return None

        if isinstance(item, str):
            text = item.strip()
            return text or None

        if isinstance(item, dict):
            # 兼容类似 {"text": "..."} / {"rec_text": "..."} / {"rec_texts": [..]}
            for key in ("text", "rec_text"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            rec_texts = item.get("rec_texts")
            if isinstance(rec_texts, list):
                for value in rec_texts:
                    if isinstance(value, str) and value.strip():
                        return value.strip()
            return None

        if isinstance(item, (list, tuple)):
            # 常见格式1: [box, "text", score]
            if len(item) >= 2 and isinstance(item[1], str):
                text = item[1].strip()
                return text or None

            # 常见格式2: [box, ("text", score)]
            if len(item) >= 2 and isinstance(item[1], (list, tuple)) and item[1]:
                first = item[1][0]
                if isinstance(first, str) and first.strip():
                    return first.strip()

            # 兜底：递归扫描嵌套结构
            for sub in item:
                text = OCRService._extract_text_from_rapid_result_item(sub)
                if text:
                    return text

        return None

    # 对图片格式的文件进行OCR识别
    def _extract_image_like_text(self, file_path: str | Path) -> str:
        """
        对图片（jpg/png/tiff 等）进行 OCR，返回提取的纯文本。
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        width, height = self._read_image_size(file_path)
        self._ensure_image_safe(
            width=width, height=height, source=file_path.name)

        ocr_engine = self._get_rapid_ocr()

        try:
            results, _ = ocr_engine(str(file_path))
        except Exception as exc:
            raise RuntimeError(f"图像 OCR 执行失败: {exc}") from exc

        lines: list[str] = []
        for res in results or []:
            text = self._extract_text_from_rapid_result_item(res)
            if text:
                lines.append(text)

        if not lines and results:
            logger.warning(
                "RapidOCR返回了结果但未解析出文本，首条结果类型=%s 值=%s",
                type(results[0]).__name__,
                str(results[0])[:300],
            )

        logger.info("成功提取图像文件文本，共 %d 行", len(lines))
        normalized = self._normalize_layout_text("\n".join(lines))
        return self._postprocess_ocr_text(normalized)

    def _extract_image_array_text(self, image_array: Any, source: str) -> str:
        height = int(getattr(image_array, "shape", [0, 0])[0] or 0)
        width = int(getattr(image_array, "shape", [0, 0])[1] or 0)
        if width <= 0 or height <= 0:
            raise RuntimeError(f"{source} 图像数据无效")

        self._ensure_image_safe(width=width, height=height, source=source)

        ocr_engine = self._get_rapid_ocr()
        try:
            results, _ = ocr_engine(image_array)
        except Exception as exc:
            raise RuntimeError(f"{source} OCR执行失败: {exc}") from exc

        lines: list[str] = []
        for res in results or []:
            text = self._extract_text_from_rapid_result_item(res)
            if text:
                lines.append(text)
        normalized = self._normalize_layout_text("\n".join(lines))
        return self._postprocess_ocr_text(normalized)

    def _read_image_size(self, file_path: Path) -> tuple[int, int]:
        try:
            pil_module = importlib.import_module("PIL.Image")
        except Exception as exc:
            raise RuntimeError("缺少 Pillow 依赖，无法进行图像尺寸安全检查") from exc

        try:
            with pil_module.open(str(file_path)) as image:
                width, height = image.size
            return int(width), int(height)
        except Exception as exc:
            raise RuntimeError(f"读取图像尺寸失败: {exc}") from exc

    def _ensure_image_safe(self, width: int, height: int, source: str) -> None:
        pixels = int(width) * int(height)
        if width > self._max_image_width or height > self._max_image_height or pixels > self._max_image_pixels:
            raise ValueError(
                f"图片尺寸过大（{width}x{height}），OCR识别效果不佳，请不要上传长截图. "
                f"不超过{self._max_image_width}x{self._max_image_height}"
            )

    # 获取 RapidOCR 模型
    def _get_rapid_ocr(self):
        if self._rapid_ocr is not None:
            return self._rapid_ocr

        try:
            rapidocr_module = importlib.import_module("rapidocr_onnxruntime")
            RapidOCR = getattr(rapidocr_module, "RapidOCR")
        except ImportError as exc:
            logger.error("导入 rapidocr_onnxruntime 失败: %s", str(exc))
            raise RuntimeError(
                f"无法导入 rapidocr_onnxruntime: {exc}") from exc

        try:
            self._rapid_ocr = RapidOCR()
        except Exception as exc:
            raise RuntimeError(f"初始化 RapidOCR 失败: {exc}") from exc

        return self._rapid_ocr
    # 获得本地词嵌入模型

    def _get_encoder(self):
        if self._encoder is not None:
            return self._encoder

        # 强制离线模式，避免启动时访问 HuggingFace。
        # 注意：使用强制赋值而不是 setdefault，确保生效
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        logger.info(
            f"词嵌入模型目录{config.embedding_model_path},词嵌入模型名称{self.embedding_model_name}")

        try:
            sentence_module = importlib.import_module("sentence_transformers")
            SentenceTransformer = getattr(
                sentence_module, "SentenceTransformer")
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "缺少 sentence-transformers 依赖，请先安装 requirements.txt"
            ) from exc

        # 默认会自动下载到本地，满足“本地模型编码”的要求。
        self._encoder = SentenceTransformer(
            self.embedding_model_name,
            cache_folder=config.embedding_model_path,
            local_files_only=True,
        )
        return self._encoder
    # 把文本切块编码成向量，然后存入向量数据库，用于后续语义检索。

    # 将文本切块索引到向量数据库中
    def _index_to_chroma(
        self,
        user_id: int,
        upload_id: int,
        filename: str,
        chunks: list[Document],
    ) -> None:
        if not chunks:
            logger.error("OCR没有成功文本!,无法入库")
            return

        if self.chroma_client is None:
            logger.error("Chroma 配置错误")
            raise RuntimeError("Chroma 客户端不可用")

        encoder = self._get_encoder()
        chunks_str = [chunk.page_content for chunk in chunks]
        embeddings = encoder.encode(
            chunks_str, normalize_embeddings=True).tolist()

        # 创建一个用户专属向量库,每个用户一个 collection。
        collection = self.chroma_client.get_or_create_collection(
            name=f"{self.collection_prefix}_{user_id}",
            metadata={"hnsw:space": "cosine"},
        )

        # 生成 chunk id,定位来源
        ids = [f"upload-{upload_id}-chunk-{idx}" for idx in range(len(chunks))]

        # 生成 metadata
        new_metadatas = [
            {**chunk.metadata,
             "user_id": user_id, "upload_id": upload_id, "chunk_index": idx}
            for idx, chunk in enumerate(chunks)
        ]
        metadatas = [
            {
                "user_id": user_id,
                "upload_id": upload_id,
                "filename": filename[:5],
                "chunk_index": idx,
            }
            for idx in range(len(chunks))
        ]

        collection.upsert(
            ids=ids,
            documents=chunks_str,
            embeddings=embeddings,
            metadatas=new_metadatas,
        )
        print("=====chunk_str:=======")
        for i in chunks_str:
            print(i)
        print("=====over chunk_str======")
        '''
        插入的记录示例:
            Record 1
            --------------------------------
            id: "upload-17-chunk-0"

            document:
            "学而时习之,不亦说乎"

            embedding:
            [0.12, -0.44, 0.33, ... 384]

            metadata = {
                "user_id": 5,
                "upload_id": 17,
                "chunk_index": 0,
                "raw_sentence": "学而时习之不亦说乎",
                "source": "17",
                "book_title": "论语",
                "juan": "卷一",
                "chapter": "学而篇",
                "sentence_index": 0,
                "char_count": 9,
                "has_notes": False
            }
        
        '''

    # @staticmethod
    # def _split_text(text: str, chunk_size: int = 260, overlap: int = 40) -> list[str]:
    #     normalized = OCRService._normalize_text(text)
    #     if not normalized:
    #         return []

    #     chunks: list[str] = []
    #     step = max(chunk_size - overlap, 1)
    #     for start in range(0, len(normalized), step):
    #         chunk = normalized[start: start + chunk_size].strip()
    #         if chunk:
    #             chunks.append(chunk)
    #     return chunks

    # @staticmethod
    # def _normalize_text(text: str) -> str:
    #     lines = [line.strip() for line in text.replace("\r", "\n").split("\n")]
    #     cleaned = [line for line in lines if line]
    #     return "\n".join(cleaned)
