// 这个是主页的文件
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookMarked, Landmark, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LinkButton, PaperPanel } from '../components/ui';
import { brand, heroHighlights, homeFeatureCards } from '../site';
import { getPortalOverview } from '../api';

type PortalOverview = {
  motto: string;
  preface_title: string;
  preface: string;
  stats: Array<{ label: string; value: string }>;
  spotlight: {
    source: string;
    original: string;
    translation: string;
  };
};

export default function Home() {
  const [overview, setOverview] = useState<PortalOverview | null>(null);

  useEffect(() => {
    getPortalOverview<PortalOverview>().then((response) => setOverview(response.data)).catch(() => undefined);
  }, []);

  return (
    <div className="page-shell space-y-10">
      <section className="relative overflow-hidden pt-2">
        <PaperPanel className="paper-texture shadow-soft px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_360px]">
            <div className="space-y-8">
              <div className="tag-chip inline-flex items-center gap-3 rounded-full px-4 py-1.5 text-[11px] tracking-[0.28em]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                数字国风展馆 / 论语数字典藏
              </div>

              <div className="space-y-4">
                <p className="text-xs tracking-[0.35em] text-[color:var(--ink-faint)]">&nbsp;&nbsp;&nbsp;&nbsp;WEN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;XIN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; SHI&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; DIAN</p>
                <h1 className="font-display text-5xl leading-none text-[color:var(--ink-strong)] sm:text-6xl lg:text-8xl">
                  {brand.name}
                </h1>
                <div className="flex flex-wrap items-center gap-4">
                  <p className="font-display text-2xl text-[color:var(--accent)] sm:text-3xl">{brand.edition}</p>
                  <span className="h-px w-14 bg-[color:var(--line-strong)]" />
                  <p className="text-xs tracking-[0.34em] text-[color:var(--ink-faint)]">采圣贤遗文，续千载文脉；借智能之术，焕古籍新生。</p>
                </div>
              </div>

              {/* <p className="max-w-2xl text-lg leading-9 text-[color:var(--ink-muted)]">
                
              </p> */}

              <div className="grid gap-4 md:grid-cols-3">
                {heroHighlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[28px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.44)] px-5 py-5"
                  >
                    <p className="font-display text-xl text-[color:var(--ink-strong)]">{item.title}</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{item.description}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <LinkButton to="/exhibition" variant="secondary">
                  开启沉浸体验
                </LinkButton>
                <LinkButton to="/upload" variant="ghost">
                  置卷入案
                </LinkButton>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(overview?.stats || []).map((item) => (
                  <div key={item.label} className="rounded-[26px] border border-[color:var(--line-soft)] px-4 py-4">
                    <p className="text-xs tracking-[0.26em] text-[color:var(--ink-faint)]">{item.label}</p>
                    <p className="mt-3 font-display text-2xl text-[color:var(--ink-strong)]">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -right-16 top-0 hidden h-full xl:flex">
                <div className="vertical-ornament select-none text-[72px] leading-none text-[rgba(111,100,87,0.08)]">
                  {brand.ornament}
                </div>
              </div>

              <div className="paper-panel border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.86)] px-6 py-8 lg:px-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs tracking-[0.34em] text-[color:var(--ink-faint)]">引言 / 序</p>
                    <h2 className="mt-3 font-display text-3xl text-[color:var(--ink-strong)]">
                      {overview?.preface_title || '文脉之引'}
                    </h2>
                  </div>
                  <div className="section-divider" />
                  <p className="text-base leading-8 text-[color:var(--ink-muted)]">{
                  '平台秉承数字化重塑经典的理念, 集古籍识文、残篇补阙、寻章问义于一体，复刻竹简阅典之雅，带你领略千年儒学之美。'}</p>
                  {overview?.spotlight ? (
                    <div className="grid gap-3">
                      <div className="rounded-[24px] border border-[color:var(--line-soft)] px-4 py-4">
                        <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">{overview.spotlight.source}</p>
                        <p className="mt-2 font-display text-2xl leading-[2.4rem] text-[color:var(--ink-strong)]">
                          {overview.spotlight.original}
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-[color:var(--line-soft)] px-4 py-4">
                        <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">今释</p>
                        <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{overview.spotlight.translation}</p>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs tracking-[0.2em] text-[color:var(--accent)]">静心聆读 · 感受古意流转</p>
                </div>
              </div>
            </div>
          </div>
        </PaperPanel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <PaperPanel className="paper-texture px-4 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(154,76,57,0.08)] text-[color:var(--accent)]">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-3xl text-[color:var(--ink-strong)]">馆藏导览</h3>
              <p className="max-w-2xl text-sm leading-7 text-[color:var(--ink-muted)]">
                首页以“序厅”形式呈现平台全貌，每一个入口都对应一个实际的功能入口,整站界面以米白宣纸、浅墨文字与朱砂细节构成数字展馆语言。
              </p>
            </div>
          </div>
        </PaperPanel>

          <PaperPanel className="paper-texture px-6 py-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(184,153,101,0.14)] text-[color:var(--warm-gold)]">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <p className="mt-2 font-display text-2xl text-[color:var(--ink-strong)]">指津</p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">上传原卷，识文成稿，再由问义解惑,领略圣贤智慧，体验竹简阅读之雅带您溯源章句。</p>
            </div>
          </div>
        </PaperPanel>
      </section>

      <section className="space-y-6 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="mt-3 font-display text-4xl text-[color:var(--ink-strong)]">展陈入口</h2>
          </div>
          <Link to="/search" className="inline-flex items-center gap-2 text-sm tracking-[0.16em] text-[color:var(--accent)]">
            转入寻章问义
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {homeFeatureCards.map((card, index) => (
            <motion.div
              key={card.path}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: index * 0.04 }}
            >
              <Link
                to={card.path}
                className="group block rounded-[28px] border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.74)] px-6 py-6 shadow-card transition duration-300 hover:-translate-y-1.5 hover:border-[color:var(--line-strong)] hover:bg-[rgba(255,255,255,0.84)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--accent-soft)] bg-[rgba(154,76,57,0.06)] text-[color:var(--accent)]">
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="mt-8 font-display text-3xl text-[color:var(--ink-strong)]">{card.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[color:var(--ink-muted)]">{card.description}</p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm tracking-[0.16em] text-[color:var(--accent)]">
                  进入展签
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section> 
    </div>
  );
}
