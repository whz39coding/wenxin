// 这个是解答的界面
import { useEffect, useState } from 'react';
import { Quote, Search, Send } from 'lucide-react';
import { ActionButton, BlockingOverlay, MetaBlock, PageIntro, PaperPanel, SuccessOverlay } from '../components/ui';
import { notifyAuthRequired, searchClassics } from '../api';

const exampleQueries = ['何为仁', '君子之道', '学而时习之何解', '温故知新'];

type SearchResponse = {
  query: string;
  answer: string;
  references: string[];
  model: string;
  results: Array<{
    source: string;
    original: string;
    translation: string;
    chapter: string;
    score: number;
  }>;
};

type ProgressEvent = {
  type: 'encoding' | 'retrieving' | 'retrieved' | 'calling_llm' | 'answering' | 'translating' | 'translated' | 'completed' | 'result' | 'error';
  data: Record<string, any>;
};

const LLM_CONFIG_ERROR_MESSAGE = '调用大模型进行问义回答出错,请检查问义功能配置';

function shouldShowLlmConfigError(message: string) {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes('api key')
    || normalized.includes('apikey')
    || normalized.includes('base url')
    || normalized.includes('base_url')
    || normalized.includes('model')
    || normalized.includes('invoke-failed')
    || normalized.includes('missing-key')
    || normalized.includes('retrieval-only')
  );
}

function normalizeSearchErrorMessage(raw: string) {
  const message = (raw || '').trim();
  if (!message) {
    return '搜索出错，请稍后再试';
  }
  if (shouldShowLlmConfigError(message)) {
    return LLM_CONFIG_ERROR_MESSAGE;
  }
  return message;
}

function parseAnswer(answer: string) {
  const text = (answer || '').trim();
  if (!text) {
    return { direct: '', quote: '', explain: '', raw: '' };
  }

  const directMatch = text.match(/(?:^|\n)\s*1[\)）\.、]\s*直接回答[:：]?([\s\S]*?)(?=(?:\n\s*2[\)）\.、])|$)/);
  const quoteMatch = text.match(/(?:^|\n)\s*2[\)）\.、]\s*原文引用[:：]?([\s\S]*?)(?=(?:\n\s*3[\)）\.、])|$)/);
  const explainMatch = text.match(/(?:^|\n)\s*3[\)）\.、]\s*简要释义与展开[:：]?([\s\S]*)/);

  return {
    direct: directMatch?.[1]?.trim() || '',
    quote: quoteMatch?.[1]?.trim() || '',
    explain: explainMatch?.[1]?.trim() || '',
    raw: text,
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [successTip, setSuccessTip] = useState<{
    title: string;
    description?: string;
  } | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const parsedAnswer = parseAnswer(results?.answer || '');

  useEffect(() => {
    if (!successTip) {
      return;
    }
    // 不再自动关闭，让用户手动点击确定按钮
    return () => { };
  }, [successTip]);

  async function handleSearchStream(nextQuery?: string) {
    const target = (nextQuery ?? query).trim();
    if (!target) {
      return;
    }

    setQuery(target);
    setError('');
    setProgressMessage('');
    setIsSearching(true);

    try {
      // 从localStorage获取认证令牌
      const token = window.localStorage.getItem('lunyu_access_token');

      const response = await fetch('/api/search/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: target }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          notifyAuthRequired('尚未登录或登录状态已失效，请登录后再使用问义功能。');
          setError('');
          setProgressMessage('');
          setIsSearching(false);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('响应体不可读');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1]; // 保留未完成的行

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6); // 移除 'data: ' 前缀
              const event: ProgressEvent = JSON.parse(jsonStr);

              if (event.type === 'encoding') {
                setProgressMessage('正在分析问题...');
              } else if (event.type === 'retrieving') {
                setProgressMessage('正在检索相关章句...');
              } else if (event.type === 'retrieved') {
                setProgressMessage(event.data.message || `已检索到 ${event.data.count} 条相关内容`);
              } else if (event.type === 'calling_llm' || event.type === 'answering') {
                setProgressMessage(event.data.message || '正在生成答复...');
              } else if (event.type === 'translating') {
                setProgressMessage(event.data.message || '正在补全白话今释...');
              } else if (event.type === 'translated') {
                setProgressMessage(event.data.message || `已补全 ${event.data.count ?? 0} 条译文`);
              } else if (event.type === 'result') {
                const resultData = event.data as SearchResponse;
                setResults(resultData);
                if ((resultData.model || '').includes('answer:retrieval-only')) {
                  setError(LLM_CONFIG_ERROR_MESSAGE);
                }
                setProgressMessage('');
                setSuccessTip({
                  title: '问义完成',
                  description: '已返回相关章句与释义',
                });
              } else if (event.type === 'error') {
                setError(normalizeSearchErrorMessage(event.data.error || ''));
                setProgressMessage('');
              }
            } catch (parseError) {
              console.error('解析事件失败:', parseError);
            }
          }
        }
      }
    } catch (requestError: any) {
      setError(normalizeSearchErrorMessage(requestError?.message || ''));
      setProgressMessage('');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch(nextQuery?: string) {
    await handleSearchStream(nextQuery);
  }

  return (
    <div className="page-shell space-y-8">
      <PageIntro
        eyebrow="问义知新"
        title="寻章问义"
        description="检索页已接入后端 RAG 接口，会从《论语》知识片段中检索最相关的章句，并调用国产模型生成精简回答。"
        aside={
          <>
            <MetaBlock label="答问" value="答案结构通常为直接回答、详细展开,出处与参考片段，便于阅读与校勘。" />
            <MetaBlock label="说明" value="公示期无需配置密钥；公示期过后若未配置密钥，则只提供检索模式。无法回答问题。" />
          </>
        }
      />

      <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
        <div className="rounded-[30px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.52)] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--ink-faint)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSearch();
                  }
                }}
                placeholder="请问：何为仁？君子之道何以立身？"
                className="w-full rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.88)] py-4 pl-14 pr-5 text-[17px] text-[color:var(--ink-strong)]"
              />
            </div>
            <ActionButton variant="secondary" onClick={() => void handleSearch()} className="px-6" disabled={isSearching}>
              <Send className="h-4 w-4" />
              {isSearching ? '发问中' : '发问'}
            </ActionButton>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {exampleQueries.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => void handleSearch(item)}
                disabled={isSearching}
                className="rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.42)] px-4 py-2 text-sm text-[color:var(--ink-muted)] transition hover:border-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </PaperPanel>

      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      <div className="space-y-6">
        {!results && !isSearching ? (
          <PaperPanel className="paper-texture px-6 py-12 text-center">
            <Quote className="mx-auto h-12 w-12 text-[color:var(--ink-faint)]" />
            <p className="mt-4 font-display text-3xl text-[color:var(--ink-strong)]">静候君之提问</p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">问题将回到《论语》章句本身，而不是泛化为其他古籍问答。</p>
          </PaperPanel>
        ) : null}

        {results ? (
          <>
            <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
              <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">答问</p>
              <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">问义回应</h2>

              <div className="mt-8 space-y-10 font-serif">
                {/* 1. 直接回答：采用“引首”样式，左侧加入印泥红点缀 */}
                {parsedAnswer.direct && (
                  <div className="relative pl-5">
                    <div className="absolute left-0 top-1 bottom-1 w-1 bg-[#8C222C] rounded-sm"></div>
                    <h3 className="mb-3 text-[13px] font-bold tracking-[0.2em] text-[#8C222C]">
                      【 核心解答 】
                    </h3>
                    <p className="text-[17px] font-medium leading-8 text-gray-800 text-justify">
                      {parsedAnswer.direct}
                    </p>
                  </div>
                )}

                {/* 2. 原文引用：采用仿古籍“书页”样式，楷体呈现，带有传统折角装饰 */}
                {parsedAnswer.quote && (
                  <div className="relative mx-1 bg-[#FAF8F4] border border-[#E6DFD3] px-8 py-7 shadow-sm">
                    {/* 古代线装书的四角折线装饰 */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#BDB1A1] -translate-x-[1px] -translate-y-[1px]"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#BDB1A1] translate-x-[1px] translate-y-[1px]"></div>

                    <p className="mb-4 text-center text-[12px] tracking-[0.3em] text-[#9CA3AF]">
                      · 典 籍 原 文 ·
                    </p>
                    <blockquote className="whitespace-pre-wrap font-['KaiTi','STKaiti','serif'] text-[20px] leading-[2.2] text-[#4A4035]">
                      {/* 优化了标点换行，使排版更像古诗文 */}
                      {parsedAnswer.quote.replace(/。/g, '。\n').trim()}
                    </blockquote>
                  </div>
                )}

                {/* 3. 简要释义与展开：正文阅读区与“朱批（补充）”区 */}
                {parsedAnswer.explain && (
                  <div className="px-2">
                    <h3 className="mb-4 flex items-center gap-2 text-[14px] font-bold tracking-[0.15em] text-[#5C4D3C]">
                      <span className="h-1.5 w-1.5 rotate-45 bg-[#5C4D3C]"></span>
                      释义与展开
                    </h3>
                    <div className="space-y-6 text-[16px] leading-[2.2] text-gray-700">
                      {/* 优化正则：兼容 LLM 有时会带冒号“：”的情况 */}
                      {parsedAnswer.explain.split(/【内部知识补充】[:：]?\s*/).map((part, index) => (
                        index === 0 ? (
                          // 主体释义
                          <p key={`exp-${index}`} className="text-justify whitespace-pre-wrap">
                            {part.trim()}
                          </p>
                        ) : (
                          // 知识补充：采用古代“眉批/夹注”的样式，红字细框
                          <div key={`exp-${index}`} className="relative mt-4 border-t border-dashed border-[#D5C9B9] pt-6">
                            <div className="mb-3 flex items-center gap-2">
                              <span className="rounded-[2px] border border-[#8C222C] px-1.5 py-0.5 text-[11px] font-bold text-[#8C222C]">
                                注
                              </span>
                              <span className="text-[13px] tracking-widest text-[#8C222C]">
                                知识扩展
                              </span>
                            </div>
                            <div className="bg-gradient-to-r from-[#FAF8F4] to-transparent border-l-2 border-[#E6DFD3] p-4 text-[15px] text-gray-600">
                              <p className="whitespace-pre-wrap text-justify">{part.trim()}</p>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. 兜底显示：当大模型未严格按格式输出时 */}
                {!parsedAnswer.direct && !parsedAnswer.quote && !parsedAnswer.explain && parsedAnswer.raw && (
                  <div className="relative mx-1 bg-[#FAF8F4] border border-[#E6DFD3] px-8 py-7">
                    <p className="mb-4 text-center text-[12px] tracking-[0.3em] text-[#9CA3AF]">
                      · 解 答 ·
                    </p>
                    <p className="whitespace-pre-wrap font-serif text-[16px] leading-[2.2] text-gray-700">
                      {parsedAnswer.raw}
                    </p>
                  </div>
                )}
              </div>

              {results.references.length ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  {results.references.map((reference) => (
                    <span key={reference} className="tag-chip rounded-full px-4 py-2 text-xs tracking-[0.18em]">
                      {reference}
                    </span>
                  ))}
                </div>
              ) : null}
            </PaperPanel>

            <div className="space-y-6">
              {results.results.map((item) => (
                <div key={`${item.source}-${item.original}`}>
                  <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">语录简</p>
                        <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">{item.source}</h2>
                      </div>
                      <span className="tag-chip rounded-full px-4 py-2 text-xs tracking-[0.18em]">原文 + 译文 + 出处</span>
                    </div>

                    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="rounded-[26px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-5 py-5">
                        <p className="text-xs tracking-[0.28em] text-[color:var(--ink-faint)]">原文</p>
                        <p className="mt-4 font-display text-3xl leading-[3rem] text-[color:var(--ink-strong)]">{item.original}</p>
                      </div>
                      <div className="rounded-[26px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-5 py-5">
                        <p className="text-xs tracking-[0.28em] text-[color:var(--ink-faint)]">白话今释</p>
                        <p className="mt-4 text-[16px] leading-8 text-[color:var(--ink-muted)]">{item.translation}</p>
                      </div>
                    </div>
                    <div className="mt-5 rounded-[22px] border border-[color:var(--line-soft)] px-4 py-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                      所属篇章：{item.chapter}
                    </div>
                  </PaperPanel>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <BlockingOverlay
        open={isSearching}
        title="寻章问义中"
        description={progressMessage || "系统正在检索章句并生成答复，请稍候。"}
      />

      <SuccessOverlay
        open={!!successTip}
        title={successTip?.title || ''}
        description={successTip?.description}
        onClose={() => setSuccessTip(null)}
      />
    </div>
  );
}
