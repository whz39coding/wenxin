// 上传的界面
import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, UploadCloud, X } from 'lucide-react';
import { PageIntro, PaperPanel, ActionButton, BlockingOverlay, MetaBlock, SuccessOverlay } from '../components/ui';
import { getStoredToken, getUploadContent, listUploads, uploadFile } from '../api';

type UploadItem = {
  id: number;
  filename: string;
  content_type: string;
  preview_mode: 'image' | 'pdf' | 'unsupported';
  file_size: number;
  extracted_text?: string | null;
  created_at: string;
};

type UploadEntry = {
  file: File;
  previewUrl?: string;
};

const uploadTips = [
  '支持 JPG、PNG、PDF 等常见卷页格式。',
  '建议使用光线均匀、边缘完整的单页扫描。',
  '竖排古籍与繁体文字场景已做专项识别优化。',
];

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadItem[]>([]);
  const [selectedUploadedId, setSelectedUploadedId] = useState<number | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [successTip, setSuccessTip] = useState<{
    title: string;
    description?: string;
    linkTo?: string;
    linkLabel?: string;
  } | null>(null);

  const queuePreviewEntry = entries[0] || null;
  const selectedUploadedItem = useMemo(
    () => uploadedItems.find((item) => item.id === selectedUploadedId) || null,
    [selectedUploadedId, uploadedItems],
  );

  const previewImageUrl = queuePreviewEntry?.file.type.startsWith('image/')
    ? queuePreviewEntry.previewUrl || ''
    : selectedUploadedItem?.preview_mode === 'image'
      ? uploadedPreviewUrl
      : '';
  const previewPdfUrl = queuePreviewEntry?.file.type.includes('pdf')
    ? queuePreviewEntry.previewUrl || ''
    : selectedUploadedItem?.preview_mode === 'pdf'
      ? uploadedPreviewUrl
      : '';
  const previewTitle = queuePreviewEntry?.file.name || selectedUploadedItem?.filename || '卷页预览';

  async function loadUploads() {
    const token = getStoredToken();
    if (!token) {
      setMessage('⚠️ 认证信息已过期，请重新登录。');
      setUploadedItems([]);
      return;
    }
    try {
      const response = await listUploads<UploadItem[]>();
      setUploadedItems(response.data);
      setSelectedUploadedId((current) => current ?? response.data[0]?.id ?? null);
    } catch (error: any) {
      console.warn('[Upload] Failed to load uploads:', error.message);
      if (error?.response?.status === 401) {
        setMessage('⚠️ 登录状态已失效，请重新登录。');
      } else {
        setMessage('⚠️ 无法加载上传列表，请稍后重试。');
      }
      setUploadedItems([]);
    }
  }

  useEffect(() => {
    loadUploads();
  }, []);

  useEffect(() => {
    if (!selectedUploadedId || !getStoredToken()) {
      setUploadedPreviewUrl('');
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    getUploadContent(selectedUploadedId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(response.data);
        setUploadedPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setUploadedPreviewUrl('');
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedUploadedId]);

  useEffect(() => {
    if (!successTip) {
      return;
    }
    // 不再自动关闭，让用户手动点击确定按钮
    return () => { };
  }, [successTip]);

  const appendFiles = (files: FileList | File[]) => {
    const nextEntries = Array.from(files).map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') || file.type.includes('pdf') ? URL.createObjectURL(file) : undefined,
    }));
    setEntries((current) => [...current, ...nextEntries]);
  };

  const removeEntry = (index: number) => {
    setEntries((current) => {
      const target = current[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  async function handleUpload() {
    if (!getStoredToken()) {
      setMessage('请先登录，再上传典籍。');
      return;
    }
    if (entries.length === 0) {
      setMessage('请先选择至少一个卷页文件。');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      for (const entry of entries) {
        await uploadFile(entry.file);
      }
      entries.forEach((entry) => {
        if (entry.previewUrl) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      setEntries([]);
      setSuccessTip({
        title: '入阁成功',
        description: '卷页已入库',
        linkTo: '/ocr',
        linkLabel: '前往识文',
      });
      await loadUploads();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '上传失败，请检查登录状态或文件格式。');
    } finally {
      setUploading(false);
    }
  }

  function handleOpenPdf() {
    if (!previewPdfUrl) return;
    window.open(previewPdfUrl, '_blank', 'noopener,noreferrer');
  }

  function handleOpenImage() {
    if (!previewImageUrl) return;
    window.open(previewImageUrl, '_blank', 'noopener,noreferrer');
  }

  function handleDownloadPdf() {
    if (!previewPdfUrl) return;
    const anchor = document.createElement('a');
    anchor.href = previewPdfUrl;
    anchor.download = previewTitle.toLowerCase().endsWith('.pdf') ? previewTitle : `${previewTitle}.pdf`;
    anchor.click();
  }

  return (
    <div className="page-shell space-y-8">
      <PageIntro
        eyebrow="典籍入卷"
        title="上传典籍"
        description="可将《论语》卷页图片或 PDF 进行上传,点击提交入库即可加入到书阁中,后续可以在 OCR 页识文加入到知识库供问答使用。"
        aside={
          <>
            <MetaBlock label="支持类型" value="&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; JPG / PNG / PDF " />
            <MetaBlock label="处理流程" value="&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 上传成功后可在识文析字页选择已入库卷页，调用 OCR 接口生成文本。" />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_340px]">
        <PaperPanel className="paper-texture px-6 py-6 lg:px-8 lg:py-8">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              appendFiles(event.dataTransfer.files);
            }}
            className={`rounded-[28px] border border-dashed px-6 py-10 text-center transition lg:px-10 lg:py-14 ${isDragging
              ? 'border-[color:var(--accent)] bg-[rgba(154,76,57,0.06)]'
              : 'border-[color:var(--line-strong)] bg-[rgba(255,255,255,0.46)]'
              }`}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(184,153,101,0.10)] text-[color:var(--accent)]">
              <UploadCloud className="h-9 w-9" />
            </div>
            <h2 className="mt-6 font-display text-4xl text-[color:var(--ink-strong)]">置卷于案</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-[color:var(--ink-muted)]">
              拖拽古籍图片或 PDF 至此，或轻点下方按钮选取文件。上传接口已绑定当前登录用户。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[color:var(--accent)] px-6 py-3 text-sm tracking-[0.16em] text-white transition hover:bg-[rgba(154,76,57,0.92)]">
                选取卷页
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) {
                      appendFiles(event.target.files);
                    }
                  }}
                />
              </label>
              <ActionButton variant="ghost" onClick={handleUpload} disabled={uploading}>
                {uploading ? '上传中' : '提交入库'}
              </ActionButton>
            </div>
            {message ? <p className="mt-4 text-sm text-[color:var(--accent)]">{message}</p> : null}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-[28px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.52)] p-4">
              <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">预览</p>
              <div className="mt-4 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[22px] border border-[color:var(--line-soft)] bg-[rgba(246,240,228,0.72)]">
                {previewImageUrl ? (
                  <button
                    type="button"
                    onClick={handleOpenImage}
                    className="h-full w-full cursor-pointer"
                    title="在新窗口打开图片"
                  >
                    <img src={previewImageUrl} alt={previewTitle} className="h-full w-full object-cover" />
                  </button>
                ) : previewPdfUrl ? (
                  <div className="space-y-3 px-6 text-center text-[color:var(--ink-faint)]">
                    <FileText className="mx-auto h-10 w-10" />
                    <p className="text-sm leading-7">当前为 PDF 卷页，建议打开大窗口阅读或直接下载到本地。</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <ActionButton variant="ghost" className="px-4 py-2" onClick={handleOpenPdf}>
                        <ExternalLink className="h-4 w-4" />
                        打开 PDF
                      </ActionButton>
                      <ActionButton variant="ghost" className="px-4 py-2" onClick={handleDownloadPdf}>
                        <Download className="h-4 w-4" />
                        下载 PDF
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 px-6 text-center text-[color:var(--ink-faint)]">
                    <ImageIcon className="mx-auto h-10 w-10" />
                    <p className="text-sm leading-7">
                      {selectedUploadedItem?.preview_mode === 'pdf'
                        ? '当前选中卷页为 PDF，可在识文页继续进行处理。'
                        : '上传后将在此处呈现卷页预览。'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.52)] p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">待入阁队列</p>
                <p className="text-sm text-[color:var(--ink-muted)]">{entries.length} 份待上传卷页</p>
              </div>
              <div className="soft-scrollbar mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {entries.length === 0 ? (
                  <div className="rounded-[22px] border border-[color:var(--line-soft)] px-4 py-6 text-sm leading-7 text-[color:var(--ink-faint)]">
                    请将古卷置于案前，系统将为君识其文字，辨其章句。
                  </div>
                ) : (
                  entries.map((entry, index) => (
                    <div
                      key={`${entry.file.name}-${index}`}
                      className="group flex items-center gap-4 rounded-[22px] border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.82)] px-4 py-4"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(184,153,101,0.10)] text-[color:var(--ink-muted)]">
                        {entry.file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[color:var(--ink-strong)]">{entry.file.name}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-faint)]">{(entry.file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent-soft)] hover:text-[color:var(--accent)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </PaperPanel>

        <div className="space-y-6">
          <PaperPanel className="paper-texture px-6 py-6">
            <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">注意项</p>
            <h3 className="mt-3 font-display text-3xl text-[color:var(--ink-strong)]">上传须知</h3>
            <div className="mt-5 space-y-4">
              {uploadTips.map((tip) => (
                <div key={tip} className="rounded-[22px] border border-[color:var(--line-soft)] px-4 py-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                  {tip}
                </div>
              ))}
            </div>
          </PaperPanel>

          <PaperPanel className="paper-grid px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">在阁中</p>
                <h3 className="mt-3 font-display text-3xl text-[color:var(--ink-strong)]">已入库卷页</h3>
              </div>
              <ActionButton variant="ghost" className="px-4 py-2" onClick={loadUploads}>
                刷新
              </ActionButton>
            </div>
            <div className="mt-5 space-y-3">
              {uploadedItems.length === 0 ? (
                <p className="text-sm leading-7 text-[color:var(--ink-faint)]">当前尚无上传记录，登录后上传即可在此处看到列表。</p>
              ) : (
                uploadedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedUploadedId(item.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left text-sm leading-7 transition ${selectedUploadedId === item.id
                      ? 'border-[color:var(--accent-soft)] bg-[rgba(154,76,57,0.08)] text-[color:var(--accent)]'
                      : 'border-[color:var(--line-soft)] text-[color:var(--ink-muted)]'
                      }`}
                  >
                    <p className="truncate">{item.filename}</p>
                    <p className="mt-1 text-xs text-[color:var(--ink-faint)]">{item.content_type}</p>
                  </button>
                ))
              )}
            </div>
          </PaperPanel>
        </div>
      </div>

      <BlockingOverlay
        open={uploading}
        title="入阁进行中"
        description="正在上传卷页并写入书阁，请稍候。"
      />

      <SuccessOverlay
        open={!!successTip}
        title={successTip?.title || ''}
        description={successTip?.description}
        linkTo={successTip?.linkTo}
        linkLabel={successTip?.linkLabel}
        onClose={() => setSuccessTip(null)}
      />

    </div>
  );
}
