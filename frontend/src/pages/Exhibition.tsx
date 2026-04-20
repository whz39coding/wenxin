// 云游书阁 —— 沉浸式竹简阅读器 v3 (完全重写版)
// 参考古代竹简效果：浅木色带绿意、错落排列、绳子不遮字、竹卷展开动画

import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, ChevronRight, Maximize2, Scroll, X, Type, Palette } from 'lucide-react';
import { PageIntro } from '../components/ui';
import { getExhibitionBookPage, listExhibitionBooks } from '../api';

// ─── 类型定义 ───

type BookRecord = {
  id: number;
  filename: string;
  char_count: number;
  created_at: string;
};

type SlipData = {
  index: number;
  chars: string[];
};

type BookPage = {
  upload_id: number;
  filename: string;
  total_chars: number;
  total_pages: number;
  current_page: number;
  slips: SlipData[];
};

// ─── 常量配置 ───

const SLIPS_PER_PAGE = 8;
const CHARS_PER_SLIP = 16;

// 古代竹简的自然色彩 —— 偏橙黄，贴近示例图
const BAMBOO_COLORS = {
  // 主色调：橙黄竹色
  light: '#f4b244',
  base: '#e89f2e',
  mid: '#cc8120',
  dark: '#8a4f10',
  shadow: '#5f320a',

  // 绳索颜色：麻绳黄褐色
  ropeMain: '#cda970',
  ropeLight: '#e4c58f',
  ropeDark: '#9c7642',

  // 文字颜色：墨黑
  textMain: '#1a1208',
  textShadow: '#2a2014',

  // 高光
  highlight: 'rgba(255,252,240,0.25)',

  // 背景渐变
  bgGradient: 'linear-gradient(180deg, #f5f0e6 0%, #e8e0d0 50%, #d8d0c0 100%)',
};

// 字体选项
const FONT_OPTIONS = [
  { id: 'kaishu', name: '楷书', value: '"KaiTi","STKaiti","楷体",serif' },
  { id: 'songti', name: '宋体', value: '"SimSun","STSong","宋体",serif' },
  { id: '明朝', name: '明朝体', value: '"Noto Serif SC","Source Han Serif CN","FZShuSong-Z01",serif' },
  { id: 'lishu', name: '隶书', value: '"LiSu","隶书",serif' },
  { id: 'xingshu', name: '行书', value: '"KaiXingJianTi","STXingkai","行书",serif' },
];

// ─── 古代竹简纹理 SVG ───

function BambooTextureSVG({
  width,
  height,
  offsetY = 0, // 用于错落效果
}: {
  width: number;
  height: number;
  offsetY?: number;
}) {
  const nodes = [
    Math.round(height * 0.25) + offsetY,
    Math.round(height * 0.5) + offsetY * 0.5,
    Math.round(height * 0.75) + offsetY * 0.3,
  ];

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        {/* 竹简主体渐变 - 温暖的浅木色 */}
        <linearGradient id="bamboo-main-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={BAMBOO_COLORS.dark} />
          <stop offset="8%" stopColor={BAMBOO_COLORS.base} />
          <stop offset="25%" stopColor={BAMBOO_COLORS.light} />
          <stop offset="50%" stopColor={BAMBOO_COLORS.light} />
          <stop offset="75%" stopColor={BAMBOO_COLORS.base} />
          <stop offset="92%" stopColor={BAMBOO_COLORS.dark} />
          <stop offset="100%" stopColor={BAMBOO_COLORS.shadow} />
        </linearGradient>

        {/* 顶部到下部的微绿渐变 */}
        <linearGradient id="bamboo-green-tint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(180,200,160,0.12)" />
          <stop offset="50%" stopColor="rgba(200,210,170,0.08)" />
          <stop offset="100%" stopColor="rgba(160,180,140,0.15)" />
        </linearGradient>

        {/* 高光层 */}
        <linearGradient id="bamboo-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="20%" stopColor="rgba(255,255,255,0)" />
          <stop offset="35%" stopColor="rgba(255,252,240,0.2)" />
          <stop offset="50%" stopColor="rgba(255,252,240,0.25)" />
          <stop offset="65%" stopColor="rgba(255,252,240,0.2)" />
          <stop offset="80%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>

        {/* 纵向纤维纹 */}
        <pattern id="bamboo-fiber" x="0" y="0" width="4" height="100" patternUnits="userSpaceOnUse">
          <line x1="1" y1="0" x2="1" y2="100" stroke="rgba(100,90,70,0.06)" strokeWidth="0.5" />
          <line x1="3" y1="0" x2="3" y2="100" stroke="rgba(255,252,240,0.08)" strokeWidth="0.5" />
        </pattern>

        {/* 竹节阴影 */}
        <linearGradient id="node-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(60,50,30,0.4)" />
          <stop offset="50%" stopColor="rgba(60,50,30,0.2)" />
          <stop offset="100%" stopColor="rgba(60,50,30,0.4)" />
        </linearGradient>

        {/* 竹节高光 */}
        <linearGradient id="node-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,252,240,0.3)" />
          <stop offset="100%" stopColor="rgba(255,252,240,0)" />
        </linearGradient>
      </defs>

      {/* 主体背景 */}
      <rect width={width} height={height} fill="url(#bamboo-main-grad)" rx="2" />

      {/* 微绿层 */}
      <rect width={width} height={height} fill="url(#bamboo-green-tint)" rx="2" />

      {/* 纤维纹路 */}
      <rect width={width} height={height} fill="url(#bamboo-fiber)" rx="2" />

      {/* 高光层 */}
      <rect width={width} height={height} fill="url(#bamboo-shine)" rx="2" />

      {/* 竹节纹理 - 更细腻 */}
      {nodes.map((y, i) => (
        <g key={i}>
          {/* 竹节主体阴影 */}
          <rect
            x="-1"
            y={y - 3}
            width={width + 2}
            height={6}
            fill="url(#node-shadow)"
            rx="1"
          />
          {/* 竹节高光细线 */}
          <line
            x1="0"
            y1={y - 3}
            x2={width}
            y2={y - 3}
            stroke="rgba(255,252,240,0.4)"
            strokeWidth="0.6"
          />
          <line
            x1="0"
            y1={y + 2}
            x2={width}
            y2={y + 2}
            stroke="rgba(60,50,30,0.25)"
            strokeWidth="0.4"
          />
        </g>
      ))}

      {/* 顶部封口线 */}
      <rect x="0" y="0" width={width} height="6" fill={BAMBOO_COLORS.shadow} rx="1" />
      <line x1="0" y1="5" x2={width} y2={5} stroke="rgba(255,252,240,0.15)" strokeWidth="0.5" />

      {/* 底部封口线 */}
      <rect x="0" y={height - 6} width={width} height="6" fill={BAMBOO_COLORS.shadow} rx="1" />
      <line x1="0" y1={height - 5} x2={width} y2={height - 5} stroke="rgba(60,50,30,0.2)" strokeWidth="0.4" />

      {/* 侧边阴影 */}
      <rect x="0" y="0" width="2" height={height} fill="rgba(80,70,50,0.15)" rx="1" />
      <rect x={width - 2} y="0" width="2" height={height} fill="rgba(80,70,50,0.2)" rx="1" />
    </svg>
  );
}

// ─── 古代绳索组件 ───

function AncientRope({
  y,
  totalWidth,
  isTop = false,
  knotGap = 56,
}: {
  y: number;
  totalWidth: number;
  isTop?: boolean;
  knotGap?: number;
}) {
  const knotCount = Math.max(0, Math.floor(totalWidth / knotGap) - 1);

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        zIndex: 30,
        pointerEvents: 'none'
      }}
      width={totalWidth}
      height={6}
      viewBox={`0 0 ${totalWidth} 6`}
    >
      <defs>
        <linearGradient id="rope-grad-v3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BAMBOO_COLORS.ropeLight} />
          <stop offset="40%" stopColor={BAMBOO_COLORS.ropeMain} />
          <stop offset="100%" stopColor={BAMBOO_COLORS.ropeDark} />
        </linearGradient>
      </defs>

      {/* 绳索主体 */}
      <rect
        x="0"
        y={isTop ? 0 : 0}
        width={totalWidth}
        height="4"
        fill="url(#rope-grad-v3)"
        rx="2"
      />

      {/* 绳索高光 */}
      <rect
        x="0"
        y={isTop ? 0 : 0}
        width={totalWidth}
        height="2"
        fill="rgba(255,252,240,0.3)"
        rx="1"
      />

      {/* 编织纹理 */}
      <pattern id="rope-weave" x="0" y="0" width="6" height="4" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="3" y2="4" stroke="rgba(80,70,50,0.08)" strokeWidth="0.8" />
        <line x1="3" y1="0" x2="6" y2="4" stroke="rgba(255,252,240,0.1)" strokeWidth="0.8" />
      </pattern>
      <rect width={totalWidth} height="4" fill="url(#rope-weave)" />

      {Array.from({ length: knotCount }).map((_, idx) => {
        const x = (idx + 1) * knotGap;
        return (
          <g key={`knot-${idx}`}>
            <circle cx={x} cy="2" r="2.1" fill={BAMBOO_COLORS.ropeDark} />
            <circle cx={x} cy="2" r="1.2" fill={BAMBOO_COLORS.ropeLight} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── 单根竹简组件 ───

function BambooSlip({
  slip,
  slipIndex,
  totalSlips,
  slipW,
  slipH,
  fontSize,
  fontFamily,
  isFullscreen,
  initialAnimation = false, // 入场动画标记
  flipPhase = 'idle',
  flipDirection = 1,
  flipOrder = 0,
}: {
  slip: SlipData;
  slipIndex: number;
  totalSlips: number;
  slipW: number;
  slipH: number;
  fontSize: number;
  fontFamily: string;
  isFullscreen: boolean;
  initialAnimation?: boolean;
  flipPhase?: 'idle' | 'exit' | 'enter';
  flipDirection?: 1 | -1;
  flipOrder?: number;
}) {
  const [hovered, setHovered] = useState(false);

  // 示例图以整齐并列为主
  const staggerOffset = 0;
  const randomTilt = 0;

  // 入场动画：竹简从卷轴中展开
  const entryDelay = slipIndex * 0.08; // 每根竹简延迟出现

  const flipDelay = flipOrder * 0.06;
  const enterInitial = {
    rotateY: flipDirection > 0 ? 108 : -108,
    scaleX: 0.26,
    x: flipDirection > 0 ? 14 : -14,
    opacity: 0.1,
  };

  const exitTarget = {
    rotateY: flipDirection > 0 ? -116 : 116,
    scaleX: 0.2,
    x: flipDirection > 0 ? -16 : 16,
    opacity: 0.08,
  };

  const idleTarget = {
    rotateY: 0,
    scaleX: 1,
    x: 0,
    opacity: 1,
  };

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={
        flipPhase === 'enter'
          ? enterInitial
          : initialAnimation
            ? {
              opacity: 0,
              scaleX: 0.1,
              x: -20,
            }
            : false
      }
      animate={{
        ...(flipPhase === 'exit' ? exitTarget : idleTarget),
        rotateZ: randomTilt,
        y: staggerOffset,
        scaleY: 1,
      }}
      transition={{
        duration: flipPhase === 'idle' ? 0.28 : 0.36,
        ease: [0.35, 0.08, 0.18, 1],
        delay:
          flipPhase === 'idle'
            ? (initialAnimation ? entryDelay : 0)
            : flipDelay,
      }}
      style={{
        width: slipW,
        height: slipH,
        position: 'relative',
        flexShrink: 0,
        transformOrigin: 'center center',
        cursor: 'default',
        borderRadius: 2,
        // 柔和的阴影
        filter: `drop-shadow(${2 + Math.abs(slipIndex - totalSlips / 2) * 0.2}px 4px 8px rgba(60,50,30,0.25))`,
        // 确保绳子不遮挡文字：增加 padding
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      {/* 竹简纹理背景 */}
      <BambooTextureSVG
        width={slipW}
        height={slipH}
        offsetY={staggerOffset}
      />

      {/* 文字区域 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 8,
          paddingBottom: 8,
          gap: isFullscreen ? 4 : 2,
          zIndex: 4,
        }}
      >
        {slip.chars.map((ch, i) => (
          <span
            key={i}
            style={{
              fontFamily: fontFamily,
              fontSize,
              lineHeight: 1,
              // 深黑色墨迹
              color: ch === '　' || ch === ' ' ? 'transparent' : BAMBOO_COLORS.textMain,
              textShadow: '0 0 0 transparent',
              userSelect: 'none',
              letterSpacing: '0.01em',
              fontWeight: 600,
            }}
          >
            {ch || '　'}
          </span>
        ))}
      </div>

      {/* 悬停效果 */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 2,
            background: 'linear-gradient(to bottom, rgba(255,252,240,0.12) 0%, transparent 40%, transparent 60%, rgba(255,252,240,0.08) 100%)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}
    </motion.div>
  );
}

// ─── 字体选择器组件 ───

function FontSelector({
  selectedFont,
  onSelectFont
}: {
  selectedFont: string;
  onSelectFont: (fontId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid rgba(60,50,30,0.15)',
          background: 'rgba(255,252,240,0.5)',
          color: BAMBOO_COLORS.shadow,
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,252,240,0.8)';
          e.currentTarget.style.borderColor = 'rgba(60,50,30,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,252,240,0.5)';
          e.currentTarget.style.borderColor = 'rgba(60,50,30,0.15)';
        }}
      >
        <Type size={14} />
        <span style={{ fontFamily: 'inherit' }}>
          {FONT_OPTIONS.find(f => f.id === selectedFont)?.name || '楷书'}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'rgba(255,252,240,0.98)',
              border: '1px solid rgba(60,50,30,0.15)',
              borderRadius: 10,
              padding: 6,
              zIndex: 100,
              minWidth: 120,
              boxShadow: '0 4px 16px rgba(60,50,30,0.15)',
            }}
          >
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => {
                  onSelectFont(font.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  borderRadius: 6,
                  border: 'none',
                  background: selectedFont === font.id ? 'rgba(180,160,110,0.2)' : 'transparent',
                  color: BAMBOO_COLORS.shadow,
                  fontSize: 13,
                  fontFamily: font.value,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (selectedFont !== font.id) {
                    e.currentTarget.style.background = 'rgba(180,160,110,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFont !== font.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {font.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 主组件 ───

export default function ExhibitionPage() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [bookPage, setBookPage] = useState<BookPage | null>(null);
  const [renderPage, setRenderPage] = useState<BookPage | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [booksLoading, setBooksLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFont, setSelectedFont] = useState('kaishu');
  const [showEntryAnimation, setShowEntryAnimation] = useState(true);
  const [flipPhase, setFlipPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [isPageFlipping, setIsPageFlipping] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const booksRequestRef = useRef(0);
  const pageRequestRef = useRef(0);

  // 鼠标视差
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  const FLIP_STEP_DELAY_MS = 60;
  const FLIP_SLIP_DURATION_MS = 360;

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const calcFlipDuration = (slipCount: number) => {
    const count = Math.max(1, slipCount || 1);
    return (count - 1) * FLIP_STEP_DELAY_MS + FLIP_SLIP_DURATION_MS + 60;
  };

  // 字体样式
  const currentFontStyle = FONT_OPTIONS.find(f => f.id === selectedFont)?.value || FONT_OPTIONS[0].value;

  useEffect(() => {
    let alive = true;
    const requestId = ++booksRequestRef.current;
    setBooksLoading(true);
    setLoadError('');

    listExhibitionBooks<BookRecord[]>()
      .then((res) => {
        if (!alive || requestId !== booksRequestRef.current) {
          return;
        }

        const nextBooks = res.data || [];
        setBooks(nextBooks);
        setSelectedBookId((prev) => {
          if (prev !== null && nextBooks.some((item) => item.id === prev)) {
            return prev;
          }
          return nextBooks.length > 0 ? nextBooks[0].id : null;
        });
        setCurrentPage(0);
        setShowEntryAnimation(true);
      })
      .catch(() => {
        if (!alive || requestId !== booksRequestRef.current) {
          return;
        }
        setBooks([]);
        setSelectedBookId(null);
        setBookPage(null);
        setLoadError('书目加载失败，请稍后重试。');
      })
      .finally(() => {
        if (!alive || requestId !== booksRequestRef.current) {
          return;
        }
        setBooksLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedBookId === null) {
      setBookPage(null);
      setRenderPage(null);
      return;
    }

    let alive = true;
    const requestId = ++pageRequestRef.current;

    setLoading(true);
    setLoadError('');
    setShowEntryAnimation(true);

    getExhibitionBookPage<BookPage>(selectedBookId, 0, SLIPS_PER_PAGE, CHARS_PER_SLIP)
      .then((res) => {
        if (!alive || requestId !== pageRequestRef.current) {
          return;
        }
        setBookPage(res.data);
        setRenderPage(res.data);
        setCurrentPage(typeof res.data?.current_page === 'number' ? res.data.current_page : 0);
        setFlipPhase('idle');
        setIsPageFlipping(false);
      })
      .catch(() => {
        if (!alive || requestId !== pageRequestRef.current) {
          return;
        }
        setBookPage(null);
        setRenderPage(null);
        setLoadError('卷页加载失败，请稍后重试。');
      })
      .finally(() => {
        if (!alive || requestId !== pageRequestRef.current) {
          return;
        }
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedBookId]);

  const runPageFlip = useCallback(async (nextPage: number, nextDirection: 1 | -1) => {
    if (selectedBookId === null || isPageFlipping || !renderPage) {
      return;
    }

    setDirection(nextDirection);
    setFlipPhase('exit');
    setIsPageFlipping(true);
    setLoadError('');

    try {
      await wait(calcFlipDuration(renderPage.slips.length));

      const response = await getExhibitionBookPage<BookPage>(
        selectedBookId,
        nextPage,
        SLIPS_PER_PAGE,
        CHARS_PER_SLIP,
      );
      const incoming = response.data;

      setBookPage(incoming);
      setCurrentPage(typeof incoming.current_page === 'number' ? incoming.current_page : nextPage);
      setRenderPage(incoming);
      setFlipPhase('enter');

      await wait(calcFlipDuration(incoming.slips.length));
      setFlipPhase('idle');
    } catch {
      setLoadError('卷页加载失败，请稍后重试。');
      setFlipPhase('idle');
    } finally {
      setIsPageFlipping(false);
    }
  }, [isPageFlipping, renderPage, selectedBookId]);

  function selectBook(id: number) {
    setSelectedBookId(id);
    setCurrentPage(0);
    setDirection(0);
    setShowEntryAnimation(true);
  }

  const goNext = useCallback(() => {
    if (!bookPage || isPageFlipping || currentPage >= bookPage.total_pages - 1) return;
    setShowEntryAnimation(false);
    void runPageFlip(currentPage + 1, 1);
  }, [bookPage, currentPage, isPageFlipping, runPageFlip]);

  const goPrev = useCallback(() => {
    if (isPageFlipping || currentPage <= 0) return;
    setShowEntryAnimation(false);
    void runPageFlip(currentPage - 1, -1);
  }, [currentPage, isPageFlipping, runPageFlip]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
      if (e.key === 'f' || e.key === 'F') setIsFullscreen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, isFullscreen]);

  // 全屏时禁止 body 滚动
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    mouseX.set(((e.clientX - cx) / rect.width) * 4);
    mouseY.set(((e.clientY - cy) / rect.height) * 3);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  const displaySlips = renderPage ? [...renderPage.slips].reverse() : [];
  const selectedBook = books.find((b) => b.id === selectedBookId);
  const isBusy = booksLoading || loading;
  const readPct = renderPage
    ? Math.round(((renderPage.current_page + 1) / renderPage.total_pages) * 100)
    : 0;

  // 尺寸计算
  const slipW = isFullscreen ? 62 : 48;
  const slipH = isFullscreen ? 660 : 520;
  const slipGap = isFullscreen ? 3 : 2;
  const fontSize = isFullscreen ? 19 : 16;

  // 示例图主要体现顶部穿绳
  const ropePositions = [Math.round(slipH * 0.08)];

  const totalRopeWidth = displaySlips.length * (slipW + slipGap);

  // ─── 竹简阅读器核心区域 ───

  const renderViewer = (fs: boolean) => (
    <motion.div
      ref={fs ? fullscreenRef : viewerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: fs ? 0 : 500,
        overflow: 'hidden',
        perspective: fs ? '1500px' : '1000px',
        // 更平直的暖黄底色，突出竹简本体
        background: fs
          ? 'linear-gradient(180deg, #f6e3be 0%, #efd4a2 50%, #e7c389 100%)'
          : 'linear-gradient(180deg, #f8e7c6 0%, #f0d7a6 52%, #e8c88f 100%)',
      }}
    >
      {/* 轻微光影，避免舞台化 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(ellipse at 50% 30%, rgba(255,245,220,0.22) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {isBusy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            background: 'rgba(245,240,230,0.8)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {/* 竹卷展开动画 */}
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                initial={{ width: 4, height: 30, opacity: 0.3 }}
                animate={{
                  width: [4, 20, 4],
                  height: [30, 40, 30],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.1,
                }}
                style={{
                  background: BAMBOO_COLORS.base,
                  borderRadius: 2,
                }}
              />
            ))}
          </motion.div>
          <span style={{
            fontFamily: currentFontStyle,
            fontSize: 14,
            letterSpacing: '0.4em',
            color: BAMBOO_COLORS.shadow,
            opacity: 0.7,
          }}>
            正在展卷……
          </span>
        </motion.div>
      )}

      {!isBusy && books.length === 0 && (
        <div style={{ textAlign: 'center', zIndex: 5 }}>
          <BookOpen style={{
            margin: '0 auto 16px',
            width: 40,
            height: 40,
            color: BAMBOO_COLORS.dark,
            opacity: 0.4,
          }} />
          <p style={{
            fontFamily: currentFontStyle,
            fontSize: 14,
            lineHeight: 2,
            letterSpacing: '0.1em',
            color: BAMBOO_COLORS.shadow,
            opacity: 0.5,
          }}>
            当前尚无已完成识文的典籍<br />
            请先上传卷页并完成 OCR，方可在此阅读。
          </p>
        </div>
      )}

      {!isBusy && loadError && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'rgba(255,252,240,0.95)',
            borderRadius: 16,
            border: `1px solid ${BAMBOO_COLORS.dark}22`,
            padding: '20px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(60,50,30,0.15)',
          }}>
            <p style={{
              fontFamily: currentFontStyle,
              fontSize: 13,
              letterSpacing: '0.08em',
              color: BAMBOO_COLORS.shadow,
            }}>
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => {
                if (selectedBookId !== null) {
                  const requestId = ++pageRequestRef.current;
                  setLoading(true);
                  setLoadError('');
                  getExhibitionBookPage<BookPage>(selectedBookId, currentPage, SLIPS_PER_PAGE, CHARS_PER_SLIP)
                    .then((res) => {
                      if (requestId !== pageRequestRef.current) return;
                      setBookPage(res.data);
                      setRenderPage(res.data);
                    })
                    .catch(() => {
                      if (requestId !== pageRequestRef.current) return;
                      setLoadError('卷页加载失败，请稍后重试。');
                    })
                    .finally(() => {
                      if (requestId !== pageRequestRef.current) return;
                      setLoading(false);
                    });
                }
              }}
              style={{
                marginTop: 12,
                padding: '6px 16px',
                borderRadius: 20,
                border: `1px solid ${BAMBOO_COLORS.base}66`,
                background: 'transparent',
                color: BAMBOO_COLORS.shadow,
                fontSize: 12,
                fontFamily: currentFontStyle,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${BAMBOO_COLORS.base}22`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              重新载入
            </button>
          </div>
        </div>
      )}

      {!isBusy && renderPage && (
        <motion.div
          style={{
            transformStyle: 'preserve-3d',
            rotateX: springY,
            rotateY: springX,
            zIndex: 10,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: slipGap,
              padding: `0 ${fs ? 32 : 16}px`,
              position: 'relative',
              transformStyle: 'preserve-3d',
            }}
          >
            {ropePositions.map((ry, idx) => (
              <Fragment key={`rope-${idx}`}>
                <AncientRope
                  y={ry}
                  totalWidth={totalRopeWidth + (fs ? 64 : 32)}
                  knotGap={slipW + slipGap}
                  isTop={idx === 0}
                />
              </Fragment>
            ))}

            {displaySlips.map((slip, visIndex) => {
              const flipOrder = direction > 0
                ? displaySlips.length - 1 - visIndex
                : visIndex;

              return (
                <Fragment key={`slip-${renderPage.current_page}-${slip.index}`}>
                  <BambooSlip
                    slip={slip}
                    slipIndex={visIndex}
                    totalSlips={displaySlips.length}
                    slipW={slipW}
                    slipH={slipH}
                    fontSize={fontSize}
                    fontFamily={currentFontStyle}
                    isFullscreen={fs}
                    initialAnimation={showEntryAnimation && currentPage === 0}
                    flipPhase={flipPhase}
                    flipDirection={(direction >= 0 ? 1 : -1) as 1 | -1}
                    flipOrder={flipOrder}
                  />
                </Fragment>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );

  // ─── 翻页控制条 ─

  const renderControls = (fs: boolean) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: fs ? 40 : 28,
      padding: fs ? '18px 0 24px' : '14px 0 18px',
      borderTop: `1px solid ${BAMBOO_COLORS.dark}11`,
      position: 'relative',
      zIndex: 20,
      background: fs ? 'rgba(245,240,230,0.9)' : 'transparent',
    }}>
      <button
        type="button"
        onClick={goPrev}
        disabled={currentPage <= 0 || loading || isPageFlipping}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: fs ? 50 : 44,
          height: fs ? 50 : 44,
          borderRadius: '50%',
          border: `1px solid ${BAMBOO_COLORS.dark}22`,
          color: BAMBOO_COLORS.shadow,
          background: 'rgba(255,252,240,0.6)',
          cursor: currentPage <= 0 || loading || isPageFlipping ? 'not-allowed' : 'pointer',
          opacity: currentPage <= 0 || loading || isPageFlipping ? 0.3 : 1,
          transition: 'all 0.22s ease',
        }}
        onMouseEnter={(e) => {
          if (currentPage > 0 && !loading && !isPageFlipping) {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,252,240,0.9)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = BAMBOO_COLORS.base;
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,252,240,0.6)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = `${BAMBOO_COLORS.dark}22`;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        <ChevronLeft size={fs ? 24 : 20} />
      </button>

      <div style={{ textAlign: 'center', minWidth: fs ? 140 : 100 }}>
        <div style={{
          fontFamily: currentFontStyle,
          fontSize: fs ? 18 : 14,
          letterSpacing: '0.3em',
          color: BAMBOO_COLORS.shadow,
          opacity: 0.7,
        }}>
          {bookPage ? `${bookPage.current_page + 1}` : '—'}
          <span style={{ margin: '0 8px', opacity: 0.4 }}>/</span>
          {bookPage ? `${bookPage.total_pages}` : '—'}
        </div>
        {bookPage && (
          <div style={{
            marginTop: 6,
            width: fs ? 100 : 70,
            margin: '6px auto 0',
            height: 3,
            borderRadius: 2,
            background: `${BAMBOO_COLORS.dark}15`,
            overflow: 'hidden',
          }}>
            <motion.div
              animate={{ width: `${readPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: `linear-gradient(to right, ${BAMBOO_COLORS.base}, ${BAMBOO_COLORS.light})`,
                borderRadius: 2,
              }}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={goNext}
        disabled={!bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: fs ? 50 : 44,
          height: fs ? 50 : 44,
          borderRadius: '50%',
          border: `1px solid ${BAMBOO_COLORS.dark}22`,
          color: BAMBOO_COLORS.shadow,
          background: 'rgba(255,252,240,0.6)',
          cursor: !bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping ? 'not-allowed' : 'pointer',
          opacity: !bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping ? 0.3 : 1,
          transition: 'all 0.22s ease',
        }}
        onMouseEnter={(e) => {
          if (bookPage && currentPage < bookPage.total_pages - 1 && !loading && !isPageFlipping) {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,252,240,0.9)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = BAMBOO_COLORS.base;
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,252,240,0.6)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = `${BAMBOO_COLORS.dark}22`;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        <ChevronRight size={fs ? 24 : 20} />
      </button>
    </div>
  );

  // ─── 全屏浮层 ─

  const FullscreenOverlay = () => {
    if (!isFullscreen) {
      return null;
    }

    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #f8f4ec 0%, #e8e0d0 50%, #d8d0c0 100%)',
        }}
      >
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          title="退出全屏"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 60,
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: `1px solid ${BAMBOO_COLORS.dark}33`,
            background: 'rgba(255,252,240,0.82)',
            color: BAMBOO_COLORS.shadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(60,50,30,0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,252,240,0.98)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,252,240,0.82)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={18} />
        </button>

        <button
          type="button"
          onClick={goPrev}
          disabled={currentPage <= 0 || loading || isPageFlipping}
          title="上一页"
          style={{
            position: 'absolute',
            left: 18,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 60,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: `1px solid ${BAMBOO_COLORS.dark}2e`,
            background: 'rgba(255,252,240,0.8)',
            color: BAMBOO_COLORS.shadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentPage <= 0 || loading || isPageFlipping ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 0 || loading || isPageFlipping ? 0.35 : 1,
            transition: 'all 0.2s ease',
            boxShadow: '0 6px 16px rgba(60,50,30,0.15)',
          }}
          onMouseEnter={(e) => {
            if (currentPage > 0 && !loading && !isPageFlipping) {
              e.currentTarget.style.background = 'rgba(255,252,240,0.98)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,252,240,0.8)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          <ChevronLeft size={24} />
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={!bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping}
          title="下一页"
          style={{
            position: 'absolute',
            right: 18,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 60,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: `1px solid ${BAMBOO_COLORS.dark}2e`,
            background: 'rgba(255,252,240,0.8)',
            color: BAMBOO_COLORS.shadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: !bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping ? 'not-allowed' : 'pointer',
            opacity: !bookPage || currentPage >= bookPage.total_pages - 1 || loading || isPageFlipping ? 0.35 : 1,
            transition: 'all 0.2s ease',
            boxShadow: '0 6px 16px rgba(60,50,30,0.15)',
          }}
          onMouseEnter={(e) => {
            if (bookPage && currentPage < bookPage.total_pages - 1 && !loading && !isPageFlipping) {
              e.currentTarget.style.background = 'rgba(255,252,240,0.98)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,252,240,0.8)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          <ChevronRight size={24} />
        </button>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {renderViewer(true)}
        </div>
      </div>,
      document.body,
    );
  };

  // ─── 嵌入式阅读卡片 ─

  return (
    <>
      <FullscreenOverlay />

      <div className="page-shell space-y-8">
        <PageIntro
          eyebrow="云游观书"
          title="云游书阁"
          description="以古代竹简形式展读已识文典籍。竹简采用橙黄古竹配色，强调规整并列与顶部穿绳结点，贴近传统简牍视觉。支持多种书法字体选择。"
          aside={
            <>
              <div style={{
                padding: '18px 16px',
                background: 'rgba(180,160,110,0.1)',
                borderRadius: 12,
                border: `1px solid ${BAMBOO_COLORS.dark}15`,
              }}>
                <p style={{ fontSize: 12, letterSpacing: '0.2em', color: BAMBOO_COLORS.base, marginBottom: 4 }}>典籍来源</p>
                <p style={{ fontSize: 14, color: BAMBOO_COLORS.shadow }}>已完成 OCR 识文的卷页</p>
              </div>
              <div style={{
                padding: '18px 16px',
                background: 'rgba(180,160,110,0.1)',
                borderRadius: 12,
                border: `1px solid ${BAMBOO_COLORS.dark}15`,
              }}>
                <p style={{ fontSize: 12, letterSpacing: '0.2em', color: BAMBOO_COLORS.base, marginBottom: 4 }}>操作提示</p>
                <p style={{ fontSize: 14, color: BAMBOO_COLORS.shadow }}>← → 键翻页，F 键全屏阅读</p>
              </div>
            </>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">

          {/* 阅读器主卡片 */}
          <div
            style={{
              borderRadius: 24,
              background: 'linear-gradient(180deg, #f8e7c6 0%, #f0d7a6 52%, #e8c88f 100%)',
              border: `1px solid ${BAMBOO_COLORS.dark}15`,
              boxShadow: '0 8px 32px rgba(60,50,30,0.12)',
              minHeight: 600,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* 顶部标题条 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: `1px solid ${BAMBOO_COLORS.dark}12`,
              flexShrink: 0,
              background: 'rgba(255,252,240,0.6)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Scroll size={16} color={BAMBOO_COLORS.base} />
                <span style={{
                  fontFamily: currentFontStyle,
                  fontSize: 11,
                  letterSpacing: '0.35em',
                  color: BAMBOO_COLORS.shadow,
                }}>竹简木牍</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* 字体选择 */}
                <FontSelector
                  selectedFont={selectedFont}
                  onSelectFont={setSelectedFont}
                />

                {bookPage && (
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    letterSpacing: '0.15em',
                    color: BAMBOO_COLORS.dark,
                    opacity: 0.7,
                  }}>
                    第 {bookPage.current_page + 1} / {bookPage.total_pages} 页
                    <span style={{ marginLeft: 10, opacity: 0.5 }}>
                      {bookPage.total_chars.toLocaleString()} 字
                    </span>
                  </span>
                )}
                {/* 全屏按钮 */}
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  title="全屏阅读 (F)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: `1px solid ${BAMBOO_COLORS.dark}20`,
                    color: BAMBOO_COLORS.shadow,
                    background: 'rgba(255,252,240,0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,252,240,0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,252,240,0.6)';
                  }}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {renderViewer(false)}
            {renderControls(false)}
          </div>

          {/* 右侧信息栏 */}
          <div className="space-y-4">
            {/* 典藏书目 */}
            <div style={{
              borderRadius: 20,
              border: `1px solid ${BAMBOO_COLORS.dark}15`,
              background: 'rgba(255,252,240,0.8)',
              padding: 22,
              boxShadow: '0 4px 16px rgba(60,50,30,0.08)',
            }}>
              <p style={{
                fontFamily: currentFontStyle,
                fontSize: 12,
                letterSpacing: '0.4em',
                color: BAMBOO_COLORS.base,
                marginBottom: 12,
              }}>典籍</p>
              <h3 style={{
                fontFamily: currentFontStyle,
                fontSize: 24,
                color: BAMBOO_COLORS.shadow,
                marginBottom: 18,
              }}>典藏书目</h3>

              {books.length === 0 ? (
                <p style={{
                  fontFamily: currentFontStyle,
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: BAMBOO_COLORS.dark,
                  opacity: 0.6,
                }}>暂无已识文典籍</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {books.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => selectBook(book.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: selectedBookId === book.id
                          ? `2px solid ${BAMBOO_COLORS.base}`
                          : `1px solid ${BAMBOO_COLORS.dark}12`,
                        background: selectedBookId === book.id
                          ? 'rgba(180,160,110,0.15)'
                          : 'rgba(255,252,240,0.6)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <p style={{
                        fontFamily: currentFontStyle,
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: selectedBookId === book.id ? BAMBOO_COLORS.shadow : BAMBOO_COLORS.dark,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{book.filename}</p>
                      <p style={{
                        fontSize: 11,
                        color: BAMBOO_COLORS.dark,
                        opacity: 0.5,
                        marginTop: 3,
                      }}>共 {book.char_count.toLocaleString()} 字</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 阅读进度 */}
            {selectedBook && bookPage && (
              <div style={{
                borderRadius: 20,
                border: `1px solid ${BAMBOO_COLORS.dark}12`,
                background: 'rgba(255,252,240,0.8)',
                padding: 22,
                boxShadow: '0 4px 16px rgba(60,50,30,0.08)',
              }}>
                <p style={{
                  fontFamily: currentFontStyle,
                  fontSize: 12,
                  letterSpacing: '0.4em',
                  color: BAMBOO_COLORS.base,
                  marginBottom: 12,
                }}>当下展卷</p>
                <p style={{
                  fontFamily: currentFontStyle,
                  fontSize:24,
                  color: BAMBOO_COLORS.shadow,
                  marginBottom: 16,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{selectedBook.filename}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['总字数', bookPage.total_chars.toLocaleString()],
                    ['总页数', String(bookPage.total_pages)],
                    ['当前位置', `第 ${bookPage.current_page * SLIPS_PER_PAGE * CHARS_PER_SLIP + 1}–${Math.min(
                      (bookPage.current_page + 1) * SLIPS_PER_PAGE * CHARS_PER_SLIP,
                      bookPage.total_chars,
                    )} 字`],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.1em', color: BAMBOO_COLORS.dark, opacity: 0.7 }}>{label}</span>
                      <span style={{ fontSize: 11, color: BAMBOO_COLORS.shadow, fontFamily: 'monospace' }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    height: 4,
                    borderRadius: 2,
                    background: `${BAMBOO_COLORS.dark}12`,
                    overflow: 'hidden',
                  }}>
                    <motion.div
                      animate={{ width: `${readPct}%` }}
                      transition={{ duration: 0.65, ease: 'easeOut' }}
                      style={{
                        height: '100%',
                        borderRadius: 2,
                        background: `linear-gradient(to right, ${BAMBOO_COLORS.base}, ${BAMBOO_COLORS.light})`,
                      }}
                    />
                  </div>
                  <p style={{
                    textAlign: 'right',
                    fontSize: 10,
                    color: BAMBOO_COLORS.dark,
                    opacity: 0.5,
                    marginTop: 4,
                    fontFamily: 'monospace',
                  }}>{readPct}%</p>
                </div>
              </div>
            )}

            {/* 操作指南 */}
            <div style={{
              borderRadius: 20,
              border: `1px solid ${BAMBOO_COLORS.dark}10`,
              background: 'rgba(255,252,240,0.6)',
              padding: 20,
            }}>
              <p style={{
                fontSize: 15,
                letterSpacing: '0.4em',
                color: BAMBOO_COLORS.dark,
                opacity: 0.6,
                marginBottom: 12,
              }}>指引</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  '← → 方向键翻页',
                  'F 键切换全屏阅读',
                  '每页展示 8 根竹简',
                  '绳索置于简身上下两端',
                  '支持楷书、宋体等多种字体',
                  '鼠标悬停查看单简效果',
                ].map((tip) => (
                  <li key={tip} style={{
                    fontFamily: currentFontStyle,
                    fontSize: 13,
                    lineHeight: 1.7,
                    letterSpacing: '0.05em',
                    color: BAMBOO_COLORS.dark,
                    opacity: 0.7,
                    listStyle: 'none',
                    paddingLeft: 12,
                    borderLeft: `2px solid ${BAMBOO_COLORS.base}44`,
                  }}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
