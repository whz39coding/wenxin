from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/portal", tags=["portal"])


class StatItem(BaseModel):
    label: str
    value: str


class Spotlight(BaseModel):
    source: str
    original: str
    translation: str


class PortalOverviewResponse(BaseModel):
    motto: str
    preface_title: str
    preface: str
    stats: list[StatItem]
    spotlight: Spotlight


@router.get("/overview", response_model=PortalOverviewResponse)
def get_portal_overview() -> PortalOverviewResponse:
    return PortalOverviewResponse(
        motto="采圣贤遗文，续千载文脉；借智能之术，焕古籍新生。",
        preface_title="文脉之引",
        preface=(
            "平台以《论语》为核心语料，融合古籍数字化、OCR 识读、"
            "残篇修复、语义检索与白话今释，构建可持续演进的文献知识空间。"
        ),
        stats=[
            StatItem(label="收录卷页", value="128"),
            StatItem(label="OCR 识别准确率", value="96.3%"),
            StatItem(label="可检索章句", value="4,800+"),
            StatItem(label="今释条目", value="1,200"),
        ],
        spotlight=Spotlight(
            source="《论语·学而》",
            original="学而时习之，不亦说乎？",
            translation="学习之后按时温习，不也令人喜悦吗？",
        ),
    )
