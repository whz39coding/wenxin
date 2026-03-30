#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ClassicalParser — 古籍 OCR 文本分词器（句子级 RAG 专用）
==================================================================

场景锁定：
  - 来源：扫描 OCR 识别（含噪声、错字、版面残留）
  - 标点：文本已含标点符号（可直接利用标点断句，无需虚词启发）
  - 粒度：句子级（10–50 字），每个 Document 是一个完整语义句
  - 上下文：每句携带"前 N 句"作为 context_window，保证向量化时语义完整

核心设计：
  1. OCR 专项清洗：
       - 去除版面噪声（页码、栏线、图注编号等）
       - 修复常见 OCR 错误标点（全半角混用、连续重复标点）
       - 识别并剥离/保留夹注（括号注、双行注）
       - 繁简不做转换（保持原貌，避免引入错误）

  2. 标点驱动断句（Punctuation-First）：
       - 强断句标点：。！？；…  → 硬边界
       - 弱断句标点：，、：     → 超长句时的软边界
       - 连续标点合并：。。→。，，→，
       - 不依赖虚词规则（有标点时虚词规则只会添加噪声）

  3. 句子质量过滤：
       - 过短（< min_len）：合并到下一句
       - 过长（> max_len）：在弱标点处二次切割
       - OCR 乱码句（噪声字符比例过高）：丢弃
       - 纯标点句、纯数字句：丢弃

  4. 上下文窗口拼接（Context Window）：
       - 每个句子 chunk 在 page_content 中包含：
           [前 context_before 句] + 【当前句】 + [后 context_after 句]
       - raw_sentence 字段存储纯净的当前句（用于向量化）
       - 检索时用 raw_sentence 做嵌入，返回带上下文的完整 chunk

  5. 结构 Metadata：
       source / book_title / juan / chapter /
       sentence_index / char_count / has_notes

用法：
    tok = ClassicalChineseTokenizer(
        min_len        = 8,     # 句子最短字数
        max_len        = 60,    # 句子最长字数（超出则软切割）
        context_before = 2,     # 前置上下文句数
        context_after  = 1,     # 后置上下文句数
        keep_notes     = False, # 是否在正文中保留夹注
    )
    docs = tok.load_and_split("shiji.txt", book_title="史记")

    # 直接处理字符串
    docs = tok.split_text(raw_str, source="史记·五帝本纪", book_title="史记")
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple


# ── 可选：langchain Document ───────────────────────────────────────────────
try:
    from langchain_core.documents.base import Document
except ImportError:
    @dataclass
    class Document:  # type: ignore[no-redef]
        page_content: str
        metadata: dict = field(default_factory=dict)


# ===========================================================================
# 常量池
# ===========================================================================

# 强断句标点 —— 必须在此处断句
_HARD_BREAK = frozenset("。！？；…")

# 弱断句标点 —— 超长句时的备用切割点
_SOFT_BREAK = frozenset("，、：")

# OCR 常见噪声字符（用于质量评分）
_NOISE_CHARS = frozenset("□■▪▫◆◇○●★☆①②③④⑤⑥⑦⑧⑨⑩※◎〓＊＃＄")

# 章节标题正则（按优先级排列）
_RE_JUAN = re.compile(
    r"^[\s　]*"
    r"(?P<juan>卷\s*[第]?\s*[〇一二三四五六七八九十百千\d]+)"
    r"[\s　]*(?P<title>[^\n]*?)[\s　]*$",
    re.MULTILINE,
)
_RE_CHAPTER = re.compile(
    r"^[\s　]*"
    r"(?P<ch>第\s*[〇一二三四五六七八九十百千\d]+\s*[章回篇节卷])"
    r"[\s　]*(?P<title>[^\n]*?)[\s　]*$",
    re.MULTILINE,
)
_RE_TITLED_SECTION = re.compile(
    r"^[\s　]*(?P<title>[^，。！？\n]{2,15})[　\s]*\n",
    re.MULTILINE,
)

# 夹注模式（按宽度从窄到宽，避免过度匹配）
_NOTE_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"（[^（）\n]{1,60}）"), "（\\g<0>）"),  # 全角括注
    (re.compile(r"\([^()\n]{1,60}\)"),   "(\\g<0>)"),   # 半角括注
    (re.compile(r"【[^【】\n]{1,60}】"), "【\\g<0>】"),  # 方括注
    (re.compile(r"〔[^〔〕\n]{1,60}〕"), "〔\\g<0>〕"),  # 六角括注
    (re.compile(r"注[：:][^\n。；]{1,50}"), ""),          # 行内"注："
    (re.compile(r"疏[：:][^\n。；]{1,50}"), ""),          # 行内"疏："
    (re.compile(r"按[：:][^\n。；]{1,50}"), ""),          # 行内"按："
]

# OCR 版面残留
_RE_PAGE_NUM   = re.compile(r"^\s*[—\-\–]?\s*\d{1,5}\s*[—\-\–]?\s*$", re.MULTILINE)
_RE_HEADER     = re.compile(r"^[\s　]*[^\n]{1,15}[\s　]*\n(?=[\s　]*[^\n]{1,15}[\s　]*\n)", re.MULTILINE)
_RE_CTRL       = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_RE_NOISE_SYM  = re.compile(r"[□■▪▫◆◇○●★☆①②③④⑤⑥⑦⑧⑨⑩※◎〓＊＃＄％＆＠＾＿｀]")
_RE_MULTI_NL   = re.compile(r"\n{3,}")
_RE_MULTI_SP   = re.compile(r"[　 \t]+")


# ===========================================================================
# 1. OCR 专项清洗器
# ===========================================================================

class OcrCleaner:
    """
    针对古籍 OCR 输出的清洗流程。
    设计原则：宁可少清洗，不过度修改原文。
    """

    def __init__(self, keep_notes: bool = False):
        self.keep_notes = keep_notes

    def clean(self, text: str) -> Tuple[str, bool]:
        """
        清洗文本，返回 (cleaned_text, has_notes)。
        has_notes 标记原文是否含夹注（写入 metadata）。
        """
        text, has_notes = self._handle_notes(text)
        text = self._remove_ctrl(text)
        text = self._remove_page_numbers(text)
        text = self._remove_noise_symbols(text)
        text = self._fix_punctuation(text)
        text = self._normalize_whitespace(text)
        return text.strip(), has_notes

    # ── 私有 ──────────────────────────────────────────────────────────────

    def _handle_notes(self, text: str) -> Tuple[str, bool]:
        """检测夹注，按 keep_notes 决定保留或剥离。"""
        has_notes = any(pat.search(text) for pat, _ in _NOTE_PATTERNS)
        if not self.keep_notes:
            for pat, _ in _NOTE_PATTERNS:
                text = pat.sub("", text)
        return text, has_notes

    @staticmethod
    def _remove_ctrl(text: str) -> str:
        return _RE_CTRL.sub("", text)

    @staticmethod
    def _remove_page_numbers(text: str) -> str:
        """去除 OCR 识别出的页码行（含 ——12—— 形式）。"""
        # 标准页码行：——12—— / -12- / 12
        text = _RE_PAGE_NUM.sub("", text)
        # 带破折号的页码：——数字——
        text = re.sub(r"[—\-]{1,3}\s*\d{1,5}\s*[—\-]{1,3}", "", text)
        return text

    @staticmethod
    def _remove_noise_symbols(text: str) -> str:
        """去除版面噪声符号（不触碰汉字和正常标点）。"""
        return _RE_NOISE_SYM.sub("", text)

    @staticmethod
    def _fix_punctuation(text: str) -> str:
        """
        标点修复：
          - 全/半角混用统一为全角古汉语标点
          - 连续重复标点合并
          - 省略号归一
        """
        # 多字符替换（必须在 translate 之前）
        text = re.sub(r"\.{3,}|…{2,}|。{3,}", "…", text)
        text = re.sub(r"，{2,}", "，", text)
        text = re.sub(r"。{2,}", "。", text)
        text = re.sub(r"？{2,}", "？", text)
        text = re.sub(r"！{2,}", "！", text)

        # 单字符归一（translate 只接受单字符 key）
        tbl = str.maketrans({
            "．": "。",
            "｡": "。",
            "？": "？",   # 已是全角，无需改
            "！": "！",
            "；": "；",
            "：": "：",
            # 半角 → 全角（仅对确定是标点的情况）
            ";": "；",
            ":": "：",
        })
        text = text.translate(tbl)

        # 句号前不应有逗号：，。→ 。
        text = re.sub(r"[，、]\s*。", "。", text)
        # 冒号/逗号后紧跟句号：：。→ 。
        text = re.sub(r"[：:]\s*。", "。", text)

        return text

    @staticmethod
    def _normalize_whitespace(text: str) -> str:
        text = _RE_MULTI_SP.sub(" ", text)
        text = _RE_MULTI_NL.sub("\n\n", text)
        return text


# ===========================================================================
# 2. 结构提取器
# ===========================================================================

@dataclass
class Section:
    juan:    str   # 卷标识，如 "卷一"
    chapter: str   # 章节标识，如 "五帝本纪"
    content: str   # 该节正文


class StructureExtractor:
    """
    从清洗后的全文中识别卷/章结构，切分为 Section 列表。
    若无结构标记，则整本作为单个 Section。
    """

    def extract(self, text: str, book_title: str = "") -> List[Section]:
        # 优先按"卷"切
        sections = self._split_by(text, _RE_JUAN, "juan", "title")
        if len(sections) > 1:
            return sections

        # 其次按"章/回/篇/节"切
        sections = self._split_by(text, _RE_CHAPTER, "ch", "title")
        if len(sections) > 1:
            return sections

        # 无结构：整体作为一节
        return [Section(juan="", chapter=book_title, content=text)]

    @staticmethod
    def _split_by(
        text:        str,
        pattern:     re.Pattern,
        label_key:   str,
        title_key:   str,
    ) -> List[Section]:
        sections: List[Section] = []
        prev_end   = 0
        prev_label = ""
        prev_title = ""

        for m in pattern.finditer(text):
            body = text[prev_end:m.start()].strip()
            if body and prev_end > 0:
                sections.append(Section(
                    juan    = prev_label if label_key == "juan" else "",
                    chapter = prev_title,
                    content = body,
                ))
            elif body and prev_end == 0:
                # 正文前的序言
                sections.append(Section(juan="", chapter="序", content=body))

            prev_label = m.group(label_key) if label_key in m.groupdict() else ""
            prev_title = (m.group(title_key) or "").strip()
            prev_end   = m.end()

        # 最后一节
        tail = text[prev_end:].strip()
        if tail:
            sections.append(Section(
                juan    = prev_label if label_key == "juan" else "",
                chapter = prev_title,
                content = tail,
            ))

        return [s for s in sections if s.content]


# ===========================================================================
# 3. 标点驱动断句器（Punctuation-First）
# ===========================================================================

class PunctuationSentenceSplitter:
    """
    以标点为第一优先的断句器。

    因为文本已含标点，所以：
      - 硬边界（。！？；…）：直接切
      - 软边界（，、：）：仅在句子超出 max_len 时启用
      - 不使用虚词规则（有标点时虚词规则引入噪声）

    质量控制：
      - 过短句（< min_len）与下一句合并
      - 过长句（> max_len）先找软边界，找不到按 max_len 强切
      - 噪声比过高的句子直接丢弃
    """

    def __init__(
        self,
        min_len:       int   = 8,
        max_len:       int   = 60,
        noise_ratio:   float = 0.25,   # 噪声字符占比超过此值则丢弃
    ):
        self.min_len     = min_len
        self.max_len     = max_len
        self.noise_ratio = noise_ratio

    def split(self, text: str) -> List[str]:
        """返回高质量句子列表。"""
        raw      = self._cut_on_hard_boundary(text)
        sized    = self._enforce_max_len(raw)
        merged   = self._merge_short(sized)
        filtered = [s for s in merged if self._is_valid(s)]
        return filtered

    # ── 私有：三步流水线 ──────────────────────────────────────────────────

    def _cut_on_hard_boundary(self, text: str) -> List[str]:
        """按强标点切句，每句保留末尾标点。"""
        sentences: List[str] = []
        buf = ""
        for ch in text:
            if ch == "\n":
                # 换行视为软边界，但累积的 buf 非空时先 flush
                if buf.strip():
                    buf += ch
                continue
            buf += ch
            if ch in _HARD_BREAK:
                s = buf.strip()
                if s:
                    sentences.append(s)
                buf = ""
        if buf.strip():
            sentences.append(buf.strip())
        return sentences

    def _enforce_max_len(self, sentences: List[str]) -> List[str]:
        """对超长句按软边界/强制切割。"""
        result: List[str] = []
        for sent in sentences:
            if len(sent) <= self.max_len:
                result.append(sent)
            else:
                result.extend(self._soft_cut(sent))
        return result

    def _soft_cut(self, text: str) -> List[str]:
        """在软边界处切割超长句。"""
        parts: List[str] = []
        buf = ""
        for ch in text:
            buf += ch
            if ch in _SOFT_BREAK and len(buf) >= self.min_len:
                parts.append(buf.strip())
                buf = ""
        if buf.strip():
            # 剩余部分若太短则合并到最后一个
            if parts and len(buf.strip()) < self.min_len:
                parts[-1] = parts[-1] + buf.strip()
            else:
                parts.append(buf.strip())

        # 仍然过长：强制按 max_len 切
        final: List[str] = []
        for p in parts:
            if len(p) <= self.max_len:
                final.append(p)
            else:
                for i in range(0, len(p), self.max_len):
                    piece = p[i:i + self.max_len].strip()
                    if piece:
                        final.append(piece)
        return final

    def _merge_short(self, sentences: List[str]) -> List[str]:
        """将过短句与下一句合并。"""
        merged: List[str] = []
        buf = ""
        for sent in sentences:
            buf = (buf + sent) if buf else sent
            if len(buf) >= self.min_len:
                merged.append(buf)
                buf = ""
        if buf:
            if merged:
                merged[-1] = merged[-1] + buf
            else:
                merged.append(buf)
        return merged

    def _is_valid(self, sent: str) -> bool:
        """质量检查：过滤噪声句、纯符号句、纯数字句。"""
        if not sent.strip():
            return False
        
        # 过滤仅包含引号、括号的孤立标点行（这是修复单引号问题的关键）
        quote_and_bracket = set('""\'\'""\'\'()（）【】《》[]{}、，；：')
        has_valid_content = False
        for ch in sent:
            # 检查是否有汉字、字母或数字
            if "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf" or ch.isalnum():
                has_valid_content = True
                break
        
        if not has_valid_content:
            return False
        
        # 去掉标点后的有效字符数
        hanzi_and_alnum = sum(
            1 for ch in sent
            if "\u4e00" <= ch <= "\u9fff"          # CJK 汉字
            or "\u3400" <= ch <= "\u4dbf"           # CJK 扩展 A
            or ch.isalnum()
        )
        if hanzi_and_alnum == 0:
            return False
        # 噪声比
        noise_count = sum(1 for ch in sent if ch in _NOISE_CHARS)
        if len(sent) > 0 and noise_count / len(sent) > self.noise_ratio:
            return False
        # 纯数字/标点
        stripped = re.sub(r"[\d\s\W]", "", sent)
        if not stripped:
            return False
        return True


# ===========================================================================
# 4. 句子上下文窗口构建器
# ===========================================================================

@dataclass
class SentenceChunk:
    """一个带上下文窗口的句子 chunk。"""
    raw_sentence:   str          # 纯净当前句（用于向量化）
    context_text:   str          # 含前后句的完整上下文（写入 page_content）
    sentence_index: int          # 在本节中的绝对序号
    source:         str  = ""
    book_title:     str  = ""
    juan:           str  = ""
    chapter:        str  = ""
    has_notes:      bool = False


class ContextWindowBuilder:
    """
    为每个句子构建上下文窗口。

    window_text 格式（供向量模型嵌入）：
        {前 N 句}【{当前句}】{后 M 句}

    用「【】」标记当前句，让模型聚焦当前句的同时感知上下文。
    """

    def __init__(self, before: int = 2, after: int = 1):
        self.before = before
        self.after  = after

    def build(
        self,
        sentences:  List[str],
        meta_base:  dict,
        offset:     int = 0,
    ) -> List[SentenceChunk]:
        chunks: List[SentenceChunk] = []
        n = len(sentences)

        for i, sent in enumerate(sentences):
            ctx_before = sentences[max(0, i - self.before):i]
            ctx_after  = sentences[i + 1:i + 1 + self.after]

            # 拼接上下文，用【】标注当前句
            parts = ctx_before + [f"【{sent}】"] + ctx_after
            context_text = "".join(parts)

            chunks.append(SentenceChunk(
                raw_sentence   = sent,
                context_text   = context_text,
                sentence_index = offset + i,
                **meta_base,
            ))

        return chunks


# ===========================================================================
# 5. 主类 ClassicalChineseTokenizer
# ===========================================================================

class ClassicalChineseTokenizer:
    """
    古籍 OCR 文本分词器（句子级 RAG 专用）。

    参数
    ----
    min_len        : 句子最短有效字数。默认 8。
    max_len        : 句子最长字数，超出则在软边界处切割。默认 60。
    context_before : page_content 中前置上下文句数。默认 2。
    context_after  : page_content 中后置上下文句数。默认 1。
    keep_notes     : 是否在正文中保留夹注原文。默认 False。
    noise_ratio    : 句子噪声字符占比阈值，超出则丢弃该句。默认 0.25。

    输出 Document
    -------------
    page_content   : 【当前句】带前后上下文的完整文本（供向量化）
    metadata:
        raw_sentence   : 纯净当前句（可作 dense retrieval 的查询锚点）
        source         : 文件路径或自定义来源标识
        book_title     : 书名
        juan           : 卷标识（如"卷一"）
        chapter        : 章节标识（如"五帝本纪"）
        sentence_index : 全文句子序号（从 0 开始）
        char_count     : 当前句字数
        has_notes      : 原文是否含夹注
    """

    def __init__(
        self,
        min_len:        int   = 8,
        max_len:        int   = 60,
        context_before: int   = 2,
        context_after:  int   = 1,
        keep_notes:     bool  = False,
        noise_ratio:    float = 0.25,
    ):
        self.cleaner   = OcrCleaner(keep_notes=keep_notes)
        self.extractor = StructureExtractor()
        self.splitter  = PunctuationSentenceSplitter(
            min_len     = min_len,
            max_len     = max_len,
            noise_ratio = noise_ratio,
        )
        self.builder   = ContextWindowBuilder(
            before = context_before,
            after  = context_after,
        )

    # ── 主入口：文件 ─────────────────────────────────────────────────────

    def load_and_split(
        self,
        text:  str,
        source: str = "",
        book_title: str = "",
    ) -> List[Document]:
        """
        读取文本文件（自动检测编码），返回句子级 Document 列表。
        """

        title = book_title if book_title else "未知" 
        return self.split_text(text, source=source, book_title=title)

    # ── 主入口：字符串 ────────────────────────────────────────────────────

    def split_text(
        self,
        text:       str,
        source:     str = "",
        book_title: str = "",
    ) -> List[Document]:
        """
        直接处理字符串，返回句子级 Document 列表。
        适用于数据库内容、API 获取的原文等非文件场景。
        """
        # 1. OCR 清洗
        cleaned, has_notes = self.cleaner.clean(text)

        # 2. 结构提取
        sections = self.extractor.extract(cleaned, book_title=book_title)

        # 3. 断句 → 上下文窗口 → Document
        docs: List[Document] = []
        global_offset = 0

        for sec in sections:
            sentences = self.splitter.split(sec.content)
            if not sentences:
                continue

            meta_base = dict(
                source     = source,
                book_title = book_title,
                juan       = sec.juan,
                chapter    = sec.chapter,
                has_notes  = has_notes,
            )

            chunks = self.builder.build(sentences, meta_base, offset=global_offset)
            global_offset += len(sentences)

            for chunk in chunks:
                docs.append(Document(
                    page_content = chunk.context_text,
                    metadata     = {
                        "raw_sentence"   : chunk.raw_sentence,
                        "source"         : chunk.source,
                        "book_title"     : chunk.book_title,
                        "juan"           : chunk.juan,
                        "chapter"        : chunk.chapter,
                        "sentence_index" : chunk.sentence_index,
                        "char_count"     : len(chunk.raw_sentence),
                        "has_notes"      : chunk.has_notes,
                    },
                ))

        return docs
    # ── 工具 
    @staticmethod
    def _read_file(path: Path) -> str:
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            return raw[3:].decode("utf-8", errors="ignore")
        if raw.startswith(b"\xff\xfe"):
            return raw.decode("utf-16-le", errors="ignore")
        if raw.startswith(b"\xfe\xff"):
            return raw.decode("utf-16-be", errors="ignore")
        try:
            import chardet
            enc = chardet.detect(raw).get("encoding") or "utf-8"
        except ImportError:
            enc = "utf-8"
        return raw.decode(enc, errors="ignore")


# ===========================================================================
# 自测
# ===========================================================================

if __name__ == "__main__":
    import sys

    # 含标点、含夹注、含 OCR 噪声的模拟文本
    SAMPLE = """\
卷一  本紀第一  五帝本紀

黃帝者，少典之子，姓公孫，名曰軒轅（一說名熊）。生而神靈，弱而能言，幼而徇齊，長而敦敏，成而聰明。
軒轅之時，神農氏世衰。諸侯相侵伐，暴虐百姓，而神農氏弗能征。於是軒轅乃習用干戈，以征不享，諸侯咸來賓從。
而蚩尤最為暴，莫能伐。炎帝欲侵陵諸侯，諸侯咸歸軒轅。軒轅乃修德振兵，治五氣，蓺五種，撫萬民，度四方，
教熊羆貔貅貙虎，以與炎帝戰於阪泉之野。三戰，然後得其志。

——12——

蚩尤作亂，不用帝命。於是黃帝乃征師諸侯，與蚩尤戰於涿鹿之野，遂禽殺蚩尤。而諸侯咸尊軒轅為天子，代神農氏，是為黃帝。
天下有不順者，黃帝從而征之，平者去之，披山通道，未嘗寧居。

東至於海，登丸山，及岱宗。西至於空桐，登雞頭。南至於江，登熊、湘。北逐葷粥，合符釜山，而邑於涿鹿之阿。
遷徙往來無常處，以師兵為營衛。官名皆以雲命，為雲師（注：以雲紀官，故曰雲師）。置左右大監，監於萬國。
萬國和，而鬼神山川封禪與為多焉。獲寶鼎，迎日推策。舉風后、力牧、常先、大鴻以治民。

卷二  本紀第二  夏本紀

夏禹，名曰文命。禹之父曰鯀，鯀之父曰帝顓頊，顓頊之父曰昌意，昌意之父曰黃帝。
禹者，黃帝之玄孫而帝顓頊之孫也（索隱：按世本，顓頊生鯀，鯀生禹）。
禹之曾大父昌意及父鯀皆不得在帝位，為人臣。
"""

    if len(sys.argv) > 1:
        tok  = ClassicalChineseTokenizer()
        docs = tok.load_and_split(sys.argv[1], book_title=sys.argv[2] if len(sys.argv) > 2 else "")
    else:
        print("=" * 62)
        print("  古籍 OCR 分词器自测（含标点 · 句子级 · 上下文窗口）")
        print("=" * 62)

        tok = ClassicalChineseTokenizer(
            min_len        = 8,
            max_len        = 60,
            context_before = 2,
            context_after  = 1,
            keep_notes     = False,
        )
        docs = tok.split_text(SAMPLE, source="sample.txt", book_title="史記")

        print(f"\n共生成 {len(docs)} 个句子 chunk\n")

        for doc in docs:
            m = doc.metadata
            print(f"  [句#{m['sentence_index']:02d}]  "
                  f"卷:{m['juan'] or '—'}  "
                  f"章:{m['chapter'] or '—'}  "
                  f"字数:{m['char_count']}  "
                  f"含注:{m['has_notes']}")
            print(f"  raw_sentence : {m['raw_sentence']}")
            print(f"  page_content : {doc.page_content}")
            print()

        print("─" * 62)
        print("keep_notes=True 效果（保留夹注）：")
        tok2 = ClassicalChineseTokenizer(keep_notes=True)
        docs2 = tok2.split_text(SAMPLE, source="sample.txt", book_title="史記")
        note_docs = [d for d in docs2 if "注" in d.metadata["raw_sentence"]
                                       or "索隱" in d.metadata["raw_sentence"]]
        for doc in note_docs[:2]:
            print(f"  raw: {doc.metadata['raw_sentence']}")