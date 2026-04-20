// 这个是OCR的界面
import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, Save, ScanSearch } from 'lucide-react';
import { ActionButton, BlockingOverlay, MetaBlock, PageIntro, PaperPanel, SuccessOverlay } from '../components/ui';
import {
  getStoredToken,
  getUploadContent,
  listUnocrUploads,
  listUploads,
  recognizeUpload,
  updateProfileUploadExtractedText,
} from '../api';

type UploadItem = {
  id: number;
  filename: string;
  content_type: string;
  file_size: number;
  extracted_text?: string | null;
  created_at: string;
};

type OCRResult = {
  upload_id: number;
  text: string;
  model: string;
};

export default function OCRPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [unocrUploads, setUnocrUploads] = useState<UploadItem[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMimeType, setPreviewMimeType] = useState('');
  const [isWriting, setIsWriting] = useState(false);
  const [successTip, setSuccessTip] = useState<{
    title: string;
    description?: string;
  } | null>(null);

  function isSizeGuardError(detail: string) {
    const text = (detail || '').trim();
    if (!text) {
      return false;
    }
    return (
      text.includes('尺寸过大') ||
      text.includes('像素总数') ||
      text.includes('页数过多') ||
      text.includes('请先压缩') ||
      text.includes('请拆分后再识别')
    );
  }

  const selectedUpload = useMemo(
    () => uploads.find((item) => item.id === selectedUploadId) || null,
    [selectedUploadId, uploads],
  );

  const selectedContentType = (selectedUpload?.content_type || '').toLowerCase();
  const effectivePreviewType = (previewMimeType || selectedContentType).toLowerCase();
  const isImageUpload = effectivePreviewType.startsWith('image/');
  const isPdfUpload = effectivePreviewType.includes('pdf');

  const selectableUploads = useMemo(() => {
    if (!selectedUpload) {
      return unocrUploads;
    }
    const exists = unocrUploads.some((item) => item.id === selectedUpload.id);
    if (exists) {
      return unocrUploads;
    }
    return [selectedUpload, ...unocrUploads];
  }, [selectedUpload, unocrUploads]);

  async function loadUploads() {
    const token = getStoredToken();
    if (!token) {
      setMessage('⚠️ 认证信息已过期，请重新登录。');
      setUploads([]);
      setUnocrUploads([]);
      return;
    }
    try {
      const [allResponse, unocrResponse] = await Promise.all([
        listUploads<UploadItem[]>(),
        listUnocrUploads<UploadItem[]>(),
      ]);

      setUploads(allResponse.data);
      setUnocrUploads(unocrResponse.data);

      if (unocrResponse.data[0]) {
        setSelectedUploadId((current) => current ?? unocrResponse.data[0].id);
      }
    } catch (error: any) {
      console.warn('[OCR] Failed to load uploads:', error.message);
      if (error?.response?.status === 401) {
        setMessage('⚠️ 登录状态已失效，请重新登录。');
      } else {
        setMessage('⚠️ 无法加载上传列表，请检查网络连接。');
      }
      setUploads([]);
      setUnocrUploads([]);
    }
  }

  useEffect(() => {
    void loadUploads();
  }, []);

  useEffect(() => {
    const active = uploads.find((item) => item.id === selectedUploadId);
    setResult(active?.extracted_text || '');
  }, [selectedUploadId, uploads]);

  useEffect(() => {
    if (!selectedUploadId || !getStoredToken()) {
      setPreviewUrl('');
      setPreviewMimeType('');
      return;
    }

    let cancelled = false;
    let objectUrl = '';
    getUploadContent(selectedUploadId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const responseTypeHeader =
          typeof response.headers?.['content-type'] === 'string' ? response.headers['content-type'] : '';
        const fallbackType = selectedUpload?.content_type || responseTypeHeader || response.data.type || 'application/octet-stream';
        const blob = response.data.type
          ? response.data
          : new Blob([response.data], { type: fallbackType });
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setPreviewMimeType((blob.type || fallbackType || '').toLowerCase());
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl('');
          setPreviewMimeType('');
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedUploadId, selectedUpload?.content_type]);

  useEffect(() => {
    if (!successTip) {
      return;
    }
    // 不再自动关闭，让用户手动点击确定按钮
    return () => { };
  }, [successTip]);

  async function handleRecognize() {
    if (!selectedUploadId) {
      setMessage('请先登录并上传卷页，再执行识文。');
      return;
    }
    setMessage('');
    setIsProcessing(true);
    try {
      const response = await recognizeUpload<OCRResult>(selectedUploadId);
      setResult(response.data.text);
      setSuccessTip({
        title: 'OCR 识别完成',
        description: `已使用 ${response.data.model}`,
      });
      await loadUploads();
    } catch (error: any) {
      const detail = error?.response?.data?.detail || '识文请求失败，请稍后再试。';
      if (isSizeGuardError(detail)) {
        setSuccessTip({
          title: '识文已中止',
          description: detail,
        });
        setMessage('');
      } else {
        setMessage(detail);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCopy() {
    if (!result) {
      return;
    }
    await navigator.clipboard.writeText(result);
    setSuccessTip({ title: '已复制识文结果' });
  }

  async function handleWriteToStudy() {
    if (!selectedUploadId) {
      setMessage('请先选择要写入书阁的卷页。');
      return;
    }

    const normalizedText = result.trim();
    if (!normalizedText) {
      setMessage('誊录纸页内容为空，无法写入书阁。');
      return;
    }

    setIsWriting(true);
    setMessage('');
    try {
      await updateProfileUploadExtractedText(selectedUploadId, normalizedText);
      setSuccessTip({
        title: '入阁成功',
        description: '识文内容已更新',
      });
      await loadUploads();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '写入书阁失败，请稍后再试。');
    } finally {
      setIsWriting(false);
    }
  }

  return (
    <div className="page-shell space-y-8">
      <PageIntro
        eyebrow="器以载道"
        title="识文析字"
        description="识文功能会读取你书阁中待读取的卷页文件，并将其中可识别的文字保存为后续补阙、问义的知识基础。"
        aside={
          <>
            <MetaBlock label="溯源" value="图片调用OCR模型进行提取文本；PDF 若本身带文本层，会直接提取真实内容。" />
            <MetaBlock label="输出" value="识文结果存入知识库为后续问答提供上下文参考；入库知识可在书阁中修改查看。" />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">原典拾珍</p>
              <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">原卷</h2>
            </div>
            <select
              className="rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-2 text-sm"
              value={selectedUploadId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedUploadId(value ? Number(value) : null);
              }}
            >
              <option value="">{selectableUploads.length === 0 ? '暂无待识文卷页' : '请选择'}</option>
              {selectableUploads.map((upload) => (
                <option key={upload.id} value={upload.id}>
                  {upload.filename}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 rounded-[30px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] border border-[color:var(--line-soft)] bg-[linear-gradient(180deg,rgba(247,241,230,0.94),rgba(239,228,214,0.82))]">
              {isProcessing ? (
                <div className="absolute left-0 right-0 top-0 h-1 animate-pulse bg-[color:var(--accent)] shadow-[0_0_18px_rgba(154,76,57,0.55)]" />
              ) : null}
              {isImageUpload && previewUrl ? (
                <img src={previewUrl} alt={selectedUpload?.filename || 'uploaded-image'} className="h-full w-full object-contain" />
              ) : previewUrl ? (
                <object data={previewUrl} type="application/pdf" className="h-full w-full">
                  <iframe src={previewUrl} title={selectedUpload?.filename || 'uploaded-pdf'} className="h-full w-full" />
                </object>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[color:var(--ink-faint)]">
                  {selectedUploadId ? '文件已选中，但当前浏览器无法预览该格式，请先执行识文查看右侧文本。' : '请先在上传页完成卷页入库。'}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton variant="secondary" onClick={handleRecognize} disabled={isProcessing}>
              <ScanSearch className="h-4 w-4" />
              {isProcessing ? '识文中' : '开始识别'}
            </ActionButton>
            <ActionButton variant="ghost" onClick={() => void loadUploads()}>
              刷新卷页列表
            </ActionButton>
          </div>
          {message ? <p className="mt-4 text-sm text-[color:var(--accent)]">{message}</p> : null}
        </PaperPanel>

        <PaperPanel className="paper-texture px-6 py-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">录文</p>
              <h2 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">誊录纸页</h2>
            </div>
            <div className="flex gap-2">
              <ActionButton variant="ghost" className="px-4 py-2" onClick={() => void handleCopy()} disabled={!result}>
                <Copy className="h-4 w-4" />
                复制
              </ActionButton>
              <ActionButton
                variant="secondary"
                className="px-4 py-2"
                onClick={() => void handleWriteToStudy()}
                disabled={!result || isWriting || isProcessing}
              >
                <Save className="h-4 w-4" />
                {isWriting ? '写入中' : '入阁'}
              </ActionButton>
            </div>
          </div>

          <div className="mt-6 rounded-[30px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.62)] p-4">
            <div className="soft-scrollbar aspect-[4/5] overflow-y-auto rounded-[24px] border border-[color:var(--line-soft)] bg-[linear-gradient(180deg,rgba(255,252,246,0.95),rgba(249,243,234,0.84))] px-6 py-8">
              {result ? (
                <textarea
                  value={result}
                  onChange={(event) => setResult(event.target.value)}
                  rows={20}
                  className="h-full w-full resize-none border-none bg-transparent font-ui text-[17px] leading-9 text-[color:var(--ink-strong)] outline-none"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-[color:var(--ink-faint)]">
                  <FileText className="h-12 w-12" />
                  <p className="mt-4 text-base leading-8">待君开启识文之序，结果将在此处以纸页方式呈现。</p>
                </div>
              )}
            </div>
          </div>
        </PaperPanel>
      </div>

      <BlockingOverlay
        open={isProcessing || isWriting}
        title={isProcessing ? '识文进行中' : '入阁进行中'}
        description={
          isProcessing
            ? '系统正在调用 OCR 引擎解析卷页文字，请稍候。'
            : '正在将誊录纸页写入书阁与知识库，请勿离开当前页面。'
        }
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
