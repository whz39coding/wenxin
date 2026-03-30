import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, SendHorizonal, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { askAssistant } from '../api/assistant';

// 聊天消息类型
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantResponse = {
  answer: string;
  references: string[];
  model: string;
};

const promptsByPage: Record<string, string[]> = {
  '/': ['请介绍这个平台的核心功能。', '我应该从哪个入口开始体验？'],
  '/upload': ['上传什么格式的文件更适合识别？', '上传后的卷页会如何继续处理？'],
  '/ocr': ['识文功能适合处理什么样的卷页？', '为什么这份文档没有被正确识别？'],
  '/restore': ['补阙结果应该如何理解？', '残缺文本输入时有什么格式建议？'],
  '/search': ['如何提问更容易找到《论语》原文？', '问义结果中的出处代表什么？'],
  '/translation': ['今释页如何查看异体字解释？', '这里的原文和今释有什么关系？'],
  '/exhibition': ['书阁页现在能进行哪些互动？', '这页和《论语》原文如何联动？'],
  '/graph': ['图谱里的节点关系是什么意思？', '孔子和“仁”的关系如何理解？'],
  '/community': ['札记页适合记录什么内容？', '如何理解雅集式批注的设计？'],
  '/profile': ['书斋页的数据从哪里来？', '收藏和检索记录会显示在哪里？'],
};

export default function AssistantPanel() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '可向我问《论语》义理、页面功能，或请我为你导览当前展签。' },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: '可向我问《论语》义理、页面功能，或请我为你导览当前展签。' }]);
    setDraft('');
  }, [location.pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function sendMessage(nextContent?: string) {
    const content = (nextContent ?? draft).trim();
    if (!content || loading) {
      return;
    }
    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setDraft('');
    setLoading(true);
    try {
      const response = await askAssistant<AssistantResponse>({
        page: location.pathname,
        messages: nextMessages,
      });
      setMessages((current) => [...current, { role: 'assistant', content: response.data.answer }]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: '馆中助手暂时未能应答。你可稍后再试，或先前往“寻章问义”页继续检索。' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const promptList = promptsByPage[location.pathname] ?? ['请介绍当前页面可以做什么。', '我想围绕《论语》继续提问。'];

  return (
    <>
      <div className="fixed bottom-6 right-4 z-[70] flex flex-col items-end gap-3 sm:right-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-3 rounded-full border border-[color:var(--line-strong)] bg-[rgba(255,250,243,0.92)] px-5 py-3 text-sm tracking-[0.16em] text-[color:var(--ink-strong)] shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          <Bot className="h-4 w-4" />
          馆中助手
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[80] bg-[rgba(45,36,29,0.18)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="absolute bottom-4 right-4 w-[min(420px,calc(100vw-24px))] rounded-[34px] border border-[color:var(--line-soft)] bg-[rgba(255,250,243,0.96)] p-4 shadow-[0_28px_80px_rgba(52,38,24,0.16)] sm:bottom-6 sm:right-6"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="paper-texture rounded-[26px] border border-[color:var(--line-soft)] px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {/* <p className="text-[11px] tracking-[0.3em] text-[color:var(--ink-faint)]">AI CURATOR</p> */}
                    <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">馆中问义</h3>
                    <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">
                      可问《论语》义理、页面功能与阅读路径。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:text-[color:var(--accent)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {promptList.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => void sendMessage(item)}
                      className="rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.52)] px-3 py-2 text-xs tracking-[0.08em] text-[color:var(--ink-muted)] transition hover:border-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div ref={scrollRef} className="soft-scrollbar mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-[24px] px-4 py-4 text-sm leading-7 ${message.role === 'assistant'
                        ? 'border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.76)] text-[color:var(--ink-muted)]'
                        : 'bg-[rgba(154,76,57,0.08)] text-[color:var(--ink-strong)]'
                      }`}
                  >
                    <p className="mb-2 text-[10px] tracking-[0.24em] text-[color:var(--ink-faint)]">
                      {message.role === 'assistant' ? 'CURATOR' : 'YOU'}
                    </p>
                    <p>{message.content}</p>
                  </div>
                ))}
                {loading ? (
                  <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.76)] px-4 py-4 text-sm text-[color:var(--ink-faint)]">
                    馆中助手正在检索《论语》章句……
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-[26px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-3">
                <div className="flex items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="可问：此页如何使用？何为仁？君子之道如何理解？"
                    className="min-h-[84px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-7 text-[color:var(--ink-strong)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={loading || !draft.trim()}
                    className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--accent)] text-white transition hover:bg-[rgba(154,76,57,0.92)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <SendHorizonal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
