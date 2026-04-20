// 这个是残篇补阙的界面
import { useState } from 'react';
import { History, Info, Sparkles } from 'lucide-react';
import { ActionButton, MetaBlock, PageIntro, PaperPanel } from '../components/ui';
import { restoreText } from '../api';

type RestoreResponse = {
  input_text: string;
  restored_text: string;
  restored_segments: Array<{ text: string; restored: boolean }>;
  evidence: string[];
  explanation: string;
  model: string;
};

export default function RestorePage() {
  const [inputText, setInputText] = useState('学而时习之，不亦_乎？');
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<RestoreResponse | null>(null);
  const [error, setError] = useState('');

  async function handleRestore() {
    if (!inputText.includes('_')) {
      setError("请使用 '_' 标记残缺位置后再补阙。");
      return;
    }

    setIsRestoring(true);
    setError('');
    try {
      const response = await restoreText<RestoreResponse>(inputText);
      setResult(response.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || '补阙请求失败，请稍后再试。');
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="page-shell space-y-8">
      <PageIntro
        eyebrow="残篇续脉"
        title="残篇补阙"
        description="补阙页已接入后端修复接口。系统会先检索《论语》相关章句进行补全，若知识库无法补全，再自动调用模型补阙并返回依据。"
        aside={
          <>
            <MetaBlock label="输入" value="填入待补阙的文本，缺失位置请使用 '_' 表示（例如：不亦_乎）。" />
            <MetaBlock label="输出" value="返回补全文字、参考依据与高亮片段，适合继续人工校勘。" />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className="space-y-6">
          <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">录阙</p>
                <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">录入残文</h2>
              </div>

            </div>

            <div className="mt-6 rounded-[30px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] p-5">
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                className="min-h-[220px] w-full resize-none bg-transparent font-ui text-[18px] leading-9 text-[color:var(--ink-strong)]"
                placeholder="请输入带有 '_' 缺字标记的《论语》原文。"
              />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--line-soft)] pt-5">
                <p className="text-sm text-[color:var(--ink-faint)]">示例：学而时习之，不亦_乎？</p>
                <ActionButton variant="secondary" onClick={handleRestore} disabled={isRestoring}>
                  <Sparkles className="h-4 w-4" />
                  {isRestoring ? '补阙中' : '开始补阙'}
                </ActionButton>
              </div>
            </div>
          </PaperPanel>

          <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
            <div>
              <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">复旧</p>
              <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">续写纸面</h2>
            </div>

            {error ? <p className="mt-4 text-sm text-[color:var(--accent)]">{error}</p> : null}

            <div className="mt-6 rounded-[30px] border border-[color:var(--line-soft)] bg-[linear-gradient(180deg,rgba(255,252,246,0.96),rgba(248,241,232,0.90))] p-6">
              {isRestoring ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-[rgba(154,76,57,0.18)] border-t-[color:var(--accent)]" />
                  <p className="mt-4 text-base tracking-[0.16em] text-[color:var(--ink-muted)]">墨迹续写中</p>
                </div>
              ) : result ? (
                <div className="space-y-5">
                  <p className="font-display text-3xl leading-[3.2rem] text-[color:var(--ink-strong)]">
                    {result.restored_segments.map((segment, index) => (
                      <span
                        key={`${segment.text}-${index}`}
                        className={
                          segment.restored
                            ? 'rounded-md bg-[rgba(154,76,57,0.08)] px-1 text-[color:var(--accent)] underline decoration-[rgba(154,76,57,0.28)] underline-offset-[8px]'
                            : ''
                        }
                      >
                        {segment.text}
                      </span>
                    ))}
                  </p>
                  <div className="section-divider" />
                  <div className="rounded-[22px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.55)] px-4 py-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                    {result.explanation || '已完成补阙。'}
                  </div>
                  <div className="grid gap-4 md:grid-cols-1">
                    {result.evidence.map((item) => (
                      <div key={item} className="rounded-[22px] border border-[color:var(--line-soft)] px-4 py-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-[color:var(--ink-faint)]">
                  <Sparkles className="h-12 w-12" />
                  <p className="mt-4 text-base leading-8">待君开启补阙之序，续写结果将在此处显现。</p>
                </div>
              )}
            </div>
          </PaperPanel>
        </div>

        <div className="space-y-6">
          <PaperPanel className="paper-grid px-6 py-6">
            <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">规则</p>
            <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">补阙说明</h3>
            <div className="mt-5 space-y-4 text-sm leading-7 text-[color:var(--ink-muted)]">
              <p>1. 先从知识库中召回相关章句作为补阙参考。</p>
              <p>2. 由模型结合上下文补全缺字。</p>
              <p>3. 最终返回补阙结果与依据，便于继续人工复核。</p>
            </div>
          </PaperPanel>
        </div>
      </div>
    </div>
  );
}
