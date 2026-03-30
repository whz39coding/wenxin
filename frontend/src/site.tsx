import type { LucideIcon } from 'lucide-react';
import {
  BookOpenCheck,
  GalleryVerticalEnd,
  Home,
  MessageCircleMore,
  Network,
  ScanSearch,
  ScrollText,
  Search,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react';

export type NavItem = {
  name: string;
  path: string;
  icon: LucideIcon;
};

export const brand = {
  name: '文心识典',
  edition: '论语专版',
  motto: '采圣贤遗文，续千载文脉；借智能之术，焕古籍新生。',
  ornament: '圣言可观可问可游',
};

export const navItems: NavItem[] = [
  { name: '境门',  path: '/', icon: Home },
  { name: '上传典籍', path: '/upload', icon: Upload },
  { name: '识文',  path: '/ocr', icon: ScanSearch },
  { name: '补阙', path: '/restore', icon: Sparkles },
  { name: '解惑',  path: '/search', icon: Search },
  // { name: '今释', english: 'INTERPRET', path: '/translation', icon: BookOpenCheck },
  { name: '观书',  path: '/exhibition', icon: GalleryVerticalEnd },
  // { name: '图谱', english: 'GRAPH', path: '/graph', icon: Network },
  // { name: '札记', english: 'NOTES', path: '/community', icon: MessageCircleMore },
  { name: '书阁',  path: '/profile', icon: UserRound },
];

export const quickLinks = navItems.filter((item) =>
  ['/upload', '/ocr', '/search', '/exhibition', '/profile'].includes(item.path),
);

export const heroHighlights = [
  {
    title: '识文析字',
    description: '智能 OCR 文本重构：依托 Paddle 深度学习模型，精准识别古籍字形与版面，通过语义逻辑自动合行，确保每一篇传世经典都能被准确还原与阅读。',
  },
  {
    title: '寻章问义',
    description: '独创 “上下文感知”语义切片技术：以“标点优先”断句，将古籍切分为携带上下文的“智识单元”使 RAG 检索不仅查得准，更读得通，让每一次解惑都回归典籍原文的韵味',
  },
  {
    title: '竹简观书',
    description: '围绕《论语》原文、今释与出处建立结构化问答与检索。',
  },
];

export const homeFeatureCards = [
    {
    title: '典籍入卷',
    description: '让典籍化身为数字卷册。',
    path: '/upload',
    icon: Network,
  },
  {
    title: '器以载道',
    description: '将古卷轻置案前，识其文字，辨其章句，留其原貌。',
    path: '/ocr',
    icon: ScanSearch,
  },
  {
    title: '残篇续脉',
    description: '以语义推演补其阙文，使断简残编再续文脉。',
    path: '/restore',
    icon: Sparkles,
  },
  {
    title: '问义知新',
    description: '以问导检，以义相引，回到《论语》原文章法与本义。',
    path: '/search',
    icon: Search,
  },
  {
    title: '云游观书',
    description: '于淡墨书阁之间观卷、翻页、听注，感其流传。',
    path: '/exhibition',
    icon: GalleryVerticalEnd,
  },
  {
    title: '藏书阁',
    description: '隐入书阁深处，循迹指尖，阅卷流芳。',
    path: '/profile',
    icon: ScrollText,
  },

];

export const footerLinks = [
  { label: '数字典藏导览', path: '/upload' },
  { label: '寻到问义', path: '/search' },
  { label: '云游观书', path: '/exhibition' },
];
