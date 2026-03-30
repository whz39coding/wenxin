// 这个是书阁的界面
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, FileText, Moon, Pencil, Plus, Save, Settings2, Trash2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MetaBlock, PageIntro, PaperPanel, SuccessOverlay } from '../components/ui';
import {
  clearAuth,
  deleteProfileUpload,
  getProfileSummary,
  getProfileUploadDetail,
  getSearchSettings,
  getUISettings,
  getStoredToken,
  updateSearchSettings,
  updateUISettings,
  uploadBackgroundMusic,
  updateProfileSettings,
  updateStoredUser,
  updateProfileUploadExtractedText,
  type SearchSettingsResponse,
  type UISettingsResponse,
  type ProfileSummaryResponse,
} from '../api';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProfileSummaryResponse | null>(null);
  const [message, setMessage] = useState('');
  const [busyUploadId, setBusyUploadId] = useState<number | null>(null);
  const [editingUploadId, setEditingUploadId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsUsername, setSettingsUsername] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
  const [settingsChangePassword, setSettingsChangePassword] = useState(false);
  const [settingsErrorMessage, setSettingsErrorMessage] = useState('');
  const [successTip, setSuccessTip] = useState<{
    title: string;
    description?: string;
  } | null>(null);
  const [searchConfigOpen, setSearchConfigOpen] = useState(false);
  const [searchConfigSaving, setSearchConfigSaving] = useState(false);
  const [searchConfigError, setSearchConfigError] = useState('');
  const [searchApiKey, setSearchApiKey] = useState('');
  const [showSearchApiKey, setShowSearchApiKey] = useState(false);
  const [modelName, setModelName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [answerPrompt, setAnswerPrompt] = useState('');
  const [defaultAnswerPrompt, setDefaultAnswerPrompt] = useState('');

  const [uiConfigOpen, setUiConfigOpen] = useState(false);
  const [uiConfigSaving, setUiConfigSaving] = useState(false);
  const [uiConfigError, setUiConfigError] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'night'>('light');
  const [musicFileName, setMusicFileName] = useState('');
  const [musicUploading, setMusicUploading] = useState(false);

  const [searchSettingsLoaded, setSearchSettingsLoaded] = useState(false);
  const [uiSettingsLoaded, setUiSettingsLoaded] = useState(false);

  function toErrorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
    }
    return fallback;
  }

  function maskApiKey(value: string) {
    const normalized = (value || '').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.length <= 8) {
      return `${normalized.slice(0, 2)}******`;
    }
    return `${normalized.slice(0, 6)}${'*'.repeat(Math.max(6, normalized.length - 6))}`;
  }

  const loadSummary = useCallback(() => {
    setMessage('');
    const token = getStoredToken();
    if (!token) {
      setMessage('⚠️ 认证信息已过期，请重新登录。');
      setSummary(null);
      return;
    }

    getProfileSummary()
      .then((response) => setSummary(response.data))
      .catch((error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          console.warn('[Profile] 401 Unauthorized: clearing auth');
          setMessage('⚠️ 登录状态已失效，请重新登录。');
          clearAuth();
        } else {
          setMessage(toErrorMessage(error, '⚠️ 无法加载书斋信息，请检查网络连接。'));
        }
        setSummary(null);
      });
  }, []);

  const applyThemeMode = useCallback((mode: 'light' | 'night') => {
    const root = document.documentElement;
    if (mode === 'night') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    window.localStorage.setItem('wenxin_theme_mode', mode);
  }, []);

  const loadPreferenceSettings = useCallback(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    getSearchSettings()
      .then((response) => {
        const data: SearchSettingsResponse = response.data;
        setSearchApiKey(data.api_key || '');
        setShowSearchApiKey(false);
        setModelName(data.model || '');
        setBaseUrl(data.base_url || '');
        setAnswerPrompt(data.answer_prompt || '');
        setDefaultAnswerPrompt(data.system_default_answer_prompt || '');
        setSearchSettingsLoaded(true);
      })
      .catch(() => setSearchSettingsLoaded(false));

    getUISettings()
      .then((response) => {
        const data: UISettingsResponse = response.data;
        const normalizedMode: 'light' | 'night' = data.theme_mode === 'night' ? 'night' : 'light';
        setThemeMode(normalizedMode);
        setMusicFileName(data.music_file_name || '');
        applyThemeMode(normalizedMode);
        setUiSettingsLoaded(true);
      })
      .catch(() => setUiSettingsLoaded(false));
  }, [applyThemeMode]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadPreferenceSettings();
  }, [loadPreferenceSettings]);

  // 当启用密码修改时，严格清空所有密码字段，防止浏览器自动填充
  useEffect(() => {
    if (settingsChangePassword) {
      setSettingsCurrentPassword('');
      setSettingsNewPassword('');
      setSettingsConfirmPassword('');
      setSettingsErrorMessage('');

      // 给浏览器一点时间，然后再次清空（防止异步填充）
      const timeoutId = setTimeout(() => {
        setSettingsCurrentPassword('');
        setSettingsNewPassword('');
        setSettingsConfirmPassword('');
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [settingsChangePassword]);

  const statItems: Array<{ label: string; value: string | number; icon: any; onClick?: () => void }> = [
    { label: '总上传古籍', value: summary?.total_uploads ?? 0, icon: Upload },
    {
      label: '已识文卷页',
      value: summary?.uploads.filter((item) => item.has_extracted_text).length ?? 0,
      icon: FileText,
    },
    {
      label: '问义解答配置',
      value: searchSettingsLoaded ? '问义配置' : '未配置',
      icon: Settings2,
      onClick: () => {
        setSearchConfigError('');
        setShowSearchApiKey(false);
        setSearchConfigOpen(true);
      },
    },
    {
      label: '界面个性化设置',
      value: uiSettingsLoaded ? '界面个性化' : '未配置',
      icon: Moon,
      onClick: () => {
        setUiConfigError('');
        setUiConfigOpen(true);
      },
    },
  ];

  async function handleSaveSearchConfig() {
    setSearchConfigSaving(true);
    setSearchConfigError('');
    try {
      await updateSearchSettings({
        api_key: searchApiKey,
        model: modelName,
        base_url: baseUrl,
        answer_prompt: answerPrompt,
      });
      setSearchConfigOpen(false);
      setSearchSettingsLoaded(true);
      setSuccessTip({
        title: '问义配置已保存',
        description: '新的 API Key、模型和提示词已生效。',
      });
    } catch (error) {
      setSearchConfigError(toErrorMessage(error, '保存问义配置失败，请稍后重试。'));
    } finally {
      setSearchConfigSaving(false);
    }
  }

  async function handleSaveUiConfig() {
    setUiConfigSaving(true);
    setUiConfigError('');
    try {
      await updateUISettings(themeMode);
      applyThemeMode(themeMode);
      setUiConfigOpen(false);
      setUiSettingsLoaded(true);
      setSuccessTip({
        title: '界面配置已保存',
        description: '主题模式已更新。',
      });
    } catch (error) {
      setUiConfigError(toErrorMessage(error, '保存界面配置失败，请稍后重试。'));
    } finally {
      setUiConfigSaving(false);
    }
  }

  async function handleUploadMusic(file: File) {
    setMusicUploading(true);
    setUiConfigError('');
    try {
      const response = await uploadBackgroundMusic(file);
      setMusicFileName(response.data.music_file_name);
      setUiSettingsLoaded(true);
      setSuccessTip({
        title: '背景音乐已上传',
        description: '已保存到个性化配置。',
      });
    } catch (error) {
      setUiConfigError(toErrorMessage(error, '音乐上传失败，请更换音频文件后重试。'));
    } finally {
      setMusicUploading(false);
    }
  }

  function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function handleGoUploadPage() {
    navigate('/upload');
  }

  function openSettingsPanel() {
    if (!summary) {
      setMessage('请先登录后再修改个人资料。');
      return;
    }
    setSettingsUsername(summary.username || '');
    setSettingsEmail(summary.email || '');
    setSettingsCurrentPassword('');
    setSettingsNewPassword('');
    setSettingsConfirmPassword('');
    setSettingsChangePassword(false);
    setSettingsErrorMessage('');
    setSettingsOpen(true);
  }

  async function handleSaveSettings() {
    if (!summary) {
      return;
    }

    const username = settingsUsername.trim();
    const email = settingsEmail.trim();
    const currentPassword = settingsCurrentPassword.trim();
    const newPassword = settingsNewPassword.trim();
    const confirmPassword = settingsConfirmPassword.trim();
    const wantsPasswordChange = settingsChangePassword && (newPassword || confirmPassword);

    if (!username) {
      setSettingsErrorMessage('昵称不能为空。');
      return;
    }
    if (!email) {
      setSettingsErrorMessage('邮箱不能为空。');
      return;
    }

    if (wantsPasswordChange) {
      if (!currentPassword) {
        setSettingsErrorMessage('修改密码时请输入当前密码。');
        return;
      }
      if (newPassword.length < 6) {
        setSettingsErrorMessage('新密码长度至少为 6 位。');
        return;
      }
      if (newPassword !== confirmPassword) {
        setSettingsErrorMessage('两次输入的新密码不一致。');
        return;
      }
    }

    setSettingsSaving(true);
    setSettingsErrorMessage('');
    try {
      const response = await updateProfileSettings({
        username,
        email,
        current_password: wantsPasswordChange ? currentPassword : undefined,
        new_password: wantsPasswordChange ? newPassword : undefined,
      });

      updateStoredUser(response.data);
      setSummary((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          username: response.data.username,
          email: response.data.email,
        };
      });
      setSettingsOpen(false);
      setSuccessTip({
        title: '设置已保存',
        description: '个人信息已成功更新。',
      });
    } catch (error) {
      setSettingsErrorMessage(toErrorMessage(error, '个人信息更新失败，请稍后再试。'));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleOpenEditor(uploadId: number) {
    setEditorLoading(true);
    setMessage('');
    try {
      const response = await getProfileUploadDetail(uploadId);
      setEditingUploadId(uploadId);
      setEditingText(response.data.extracted_text || '');
    } catch (error) {
      setMessage(toErrorMessage(error, '读取识文内容失败，请稍后重试。'));
    } finally {
      setEditorLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (editingUploadId === null) return;
    const normalizedText = editingText.trim();
    if (!normalizedText) {
      setMessage('识文内容不能为空。');
      return;
    }

    setBusyUploadId(editingUploadId);
    setMessage('');
    try {
      await updateProfileUploadExtractedText(editingUploadId, normalizedText);
      setEditingUploadId(null);
      setEditingText('');
      loadSummary();
      setSuccessTip({
        title: '入库成功',
        description: '识文已保存并重建向量知识库。',
      });
    } catch (error) {
      setMessage(toErrorMessage(error, '保存失败，可能是向量库更新异常。'));
    } finally {
      setBusyUploadId(null);
    }
  }

  async function handleDeleteUpload(uploadId: number) {
    const ok = window.confirm('删除后将移除数据库记录、上传文件及向量知识，是否继续？');
    if (!ok) return;

    setBusyUploadId(uploadId);
    setMessage('');
    try {
      await deleteProfileUpload(uploadId);
      if (editingUploadId === uploadId) {
        setEditingUploadId(null);
        setEditingText('');
      }
      loadSummary();
      setSuccessTip({
        title: '删除成功',
        description: '古籍已从知识库中移除。',
      });
    } catch (error) {
      setMessage(toErrorMessage(error, '删除失败，请稍后再试。'));
    } finally {
      setBusyUploadId(null);
    }
  }

  return (
    <div className="page-shell space-y-8">
      <PageIntro
        eyebrow="藏书阁"
        title="吾之书斋"
        description="个人中心展示当前账号的上传古籍统计与上传记录明细，数据实时根据用户操作更新。"
        aside={
          <>
            <MetaBlock label="介绍" value="登录后将展示与账号绑定的上传古籍总数与识文状态。" />
            <MetaBlock label="帮助" value="可以对上传过的古籍内容进行管理(修改知识库内容,删除),同时也可以管理自己的账号信息" />
          </>
        }
      />

      {message ? <p className="text-sm text-[color:var(--accent)]">{message}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <PaperPanel className="paper-texture px-6 py-6 text-center">
            <button
              type="button"
              onClick={openSettingsPanel}
              className="group w-full rounded-[24px] border border-transparent p-3 text-center transition hover:border-[color:var(--accent-soft)]"
              title="点击设置个人资料"
            >
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[color:var(--accent-soft)] bg-[rgba(154,76,57,0.08)] font-display text-4xl text-[color:var(--accent)]">
                {summary?.username?.slice(0, 1) || '书'}
              </div>
              <h2 className="mt-5 font-display text-4xl text-[color:var(--ink-strong)]">{summary?.username || '未登录'}</h2>
              <p className="mt-2 text-xs tracking-[0.28em] text-[color:var(--ink-faint)]">{summary?.email || '请先登录'}</p>
              <p className="mt-3 text-xs text-[color:var(--ink-faint)] opacity-80 group-hover:text-[color:var(--accent)]">
                点击头像框修改昵称、邮箱、密码
              </p>
            </button>
          </PaperPanel>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {statItems.map((item) => (
              <div key={item.label}>
                <PaperPanel className="paper-texture px-5 py-5">
                  <button
                    type="button"
                    onClick={item.onClick}
                    disabled={!item.onClick}
                    className="w-full text-left disabled:cursor-default"
                  >
                    <item.icon className="h-5 w-5 text-[color:var(--accent)]" />
                    <p className="mt-4 font-display text-4xl text-[color:var(--ink-strong)]">{item.value}</p>
                    <p className="mt-2 text-xs tracking-[0.26em] text-[color:var(--ink-faint)]">{item.label}</p>
                  </button>
                </PaperPanel>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PaperPanel className="paper-texture px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.32em] text-[color:var(--ink-faint)]">详情</p>
            <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">上传记录明细</h3>
          </div>
          <button
            type="button"
            onClick={handleGoUploadPage}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-soft)] px-4 py-2 text-xs tracking-[0.1em] text-[color:var(--ink-strong)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
            添加新古籍
          </button>
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,2fr)_120px_120px_170px_130px] gap-3 border-b border-[color:var(--line-soft)] pb-2 text-xs tracking-[0.12em] text-[color:var(--ink-faint)]">
          <span>古籍文件</span>
          <span>大小</span>
          <span>识文状态</span>
          <span>上传时间</span>
          <span className="text-right">操作</span>
        </div>

        <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--ink-muted)]">
          {(summary?.uploads || []).map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,2fr)_120px_120px_170px_130px] items-center gap-3 rounded-[16px] border border-[color:var(--line-soft)] px-4 py-3"
            >
              <div>
                <p className="truncate">{item.filename}</p>
                <p className="truncate text-xs text-[color:var(--ink-faint)]">{item.content_type}</p>
              </div>
              <p className="text-xs text-[color:var(--ink-faint)]">{formatFileSize(item.file_size)}</p>
              <p className="text-xs text-[color:var(--ink-faint)]">
                {item.has_extracted_text ? '已完成 OCR' : '未识文'}
              </p>
              <p className="text-xs text-[color:var(--ink-faint)]">{formatDateTime(item.created_at)}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busyUploadId === item.id || editorLoading}
                  onClick={() => void handleOpenEditor(item.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  title="修改识文内容"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busyUploadId === item.id || editorLoading}
                  onClick={() => void handleDeleteUpload(item.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[#9a3d31] hover:text-[#9a3d31] disabled:cursor-not-allowed disabled:opacity-50"
                  title="删除古籍知识"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {!summary?.uploads?.length ? (
            <div className="rounded-[22px] border border-[color:var(--line-soft)] px-4 py-4 text-[color:var(--ink-faint)]">
              暂无上传记录
            </div>
          ) : null}
        </div>

        {editingUploadId !== null ? (
          <div className="mt-5 rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.45)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs tracking-[0.12em] text-[color:var(--ink-faint)]">
                修改识文内容（上传 ID: {editingUploadId}）
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingUploadId(null);
                  setEditingText('');
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                title="关闭编辑"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              rows={12}
              className="w-full rounded-[14px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm leading-7 text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)]"
              placeholder="请输入修订后的识文文本"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={busyUploadId === editingUploadId}
                onClick={() => void handleSaveEdit()}
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--ink-strong)] px-5 py-2 text-xs tracking-[0.1em] text-[color:var(--paper)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                保存并重建知识
              </button>
            </div>
          </div>
        ) : null}
      </PaperPanel>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <PaperPanel className="paper-texture w-full max-w-[560px] px-6 py-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">个人信息设置</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">昵称</p>
                <input
                  value={settingsUsername}
                  onChange={(event) => setSettingsUsername(event.target.value)}
                  className="w-full rounded-[14px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-sm text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)]"
                  placeholder="请输入昵称"
                />
              </div>

              <div>
                <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">邮箱</p>
                <input
                  type="email"
                  value={settingsEmail}
                  onChange={(event) => setSettingsEmail(event.target.value)}
                  className="w-full rounded-[14px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-sm text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)]"
                  placeholder="请输入邮箱"
                />
              </div>

              <div className="mt-1 rounded-[14px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.4)] p-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsChangePassword}
                    onChange={(e) => {
                      setSettingsChangePassword(e.target.checked);
                      if (e.target.checked) {
                        // 勾选时清空所有密码字段，防止自动填充
                        setSettingsCurrentPassword('');
                        setSettingsNewPassword('');
                        setSettingsConfirmPassword('');
                        setSettingsErrorMessage('');
                      }
                    }}
                    className="h-4 w-4 rounded border border-[color:var(--line-soft)] cursor-pointer"
                  />
                  <span className="text-xs tracking-[0.16em] text-[color:var(--ink-faint)]">修改密码</span>
                </label>
                {settingsChangePassword ? (
                  <>
                    {/* 虚拟不可见字段，诱导浏览器自动填充到此而不是真实字段 */}
                    <input
                      type="password"
                      name="deceptive_password_field"
                      style={{ display: 'none', visibility: 'hidden', height: 0, width: 0, margin: 0, padding: 0 }}
                      tabIndex={-1}
                      aria-hidden="true"
                    />

                    <div className="mt-2 rounded-[8px] bg-[rgba(220,38,38,0.05)] px-3 py-2">
                      <p className="text-xs text-[#dc2626]">
                        ⚠️ 为了账户安全，请确保这是本人操作。密码修改涉及账户权限变更，不要向他人透露当前密码。
                      </p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="password"
                        value={settingsCurrentPassword}
                        onChange={(event) => setSettingsCurrentPassword(event.target.value)}
                        readOnly
                        onFocus={(e) => e.target.removeAttribute('readonly')}
                        autoComplete="new-password"
                        name="field_current_pwd"
                        spellCheck={false}
                        className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)]"
                        placeholder="当前密码（必填）"
                      />
                      <input
                        type="password"
                        value={settingsNewPassword}
                        onChange={(event) => setSettingsNewPassword(event.target.value)}
                        autoComplete="off"
                        name="field_new_pwd"
                        spellCheck={false}
                        className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)]"
                        placeholder="新密码（至少6位）"
                      />
                      <input
                        type="password"
                        value={settingsConfirmPassword}
                        onChange={(event) => setSettingsConfirmPassword(event.target.value)}
                        autoComplete="off"
                        name="field_confirm_pwd"
                        spellCheck={false}
                        className="mt-3 w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm text-[color:var(--ink-strong)] outline-none focus:border-[color:var(--accent)] sm:col-span-2"
                        placeholder="确认新密码"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {settingsErrorMessage ? (
              <div className="mt-4 rounded-[12px] bg-[rgba(220,38,38,0.1)] px-4 py-3 text-sm text-[#dc2626]">
                {settingsErrorMessage}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full border border-[color:var(--line-soft)] px-5 py-2 text-xs tracking-[0.1em] text-[color:var(--ink-muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => void handleSaveSettings()}
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--ink-strong)] px-5 py-2 text-xs tracking-[0.1em] text-[color:var(--paper)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {settingsSaving ? '保存中' : '保存设置'}
              </button>
            </div>
          </PaperPanel>
        </div>
      ) : null}

      {searchConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <PaperPanel className="paper-texture w-full max-w-[760px] px-6 py-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">问义解答配置</h3>
              <button
                type="button"
                onClick={() => setSearchConfigOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">API Key（默认脱敏展示）</p>
                <div className="flex items-center gap-2">
                  <input
                    value={showSearchApiKey ? searchApiKey : maskApiKey(searchApiKey)}
                    onChange={(event) => {
                      if (showSearchApiKey) {
                        setSearchApiKey(event.target.value);
                      }
                    }}
                    readOnly={!showSearchApiKey}
                    className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm"
                    placeholder="API Key（留空将使用系统默认）"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSearchApiKey((prev) => !prev)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                    title={showSearchApiKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showSearchApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-1">
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm"
                  placeholder="模型名（问答与翻译共用）"
                />
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm"
                  placeholder="Base URL（例如 https://dashscope.aliyuncs.com/compatible-mode/v1）"
                />
              </div>
              <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">问答提示词（留空则使用系统默认提示词）</p>
              <textarea
                value={answerPrompt}
                onChange={(event) => setAnswerPrompt(event.target.value)}
                rows={10}
                className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm"
                placeholder="问答提示词（可留空，留空则使用系统默认提示词）"
              />
            </div>

            {searchConfigError ? (
              <p className="mt-3 text-sm text-[color:var(--accent)]">{searchConfigError}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setSearchConfigOpen(false)} className="rounded-full border border-[color:var(--line-soft)] px-5 py-2 text-xs">取消</button>
              <button
                type="button"
                disabled={searchConfigSaving}
                onClick={() => void handleSaveSearchConfig()}
                className="rounded-full bg-[color:var(--ink-strong)] px-5 py-2 text-xs text-[color:var(--paper)] disabled:opacity-60"
              >
                {searchConfigSaving ? '保存中' : '保存配置'}
              </button>
            </div>
          </PaperPanel>
        </div>
      ) : null}

      {uiConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <PaperPanel className="paper-texture w-full max-w-[680px] px-6 py-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h3 className="mt-2 font-display text-3xl text-[color:var(--ink-strong)]">界面个性化设置</h3>
              <button
                type="button"
                onClick={() => setUiConfigOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-soft)] text-[color:var(--ink-faint)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">主题模式</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setThemeMode('light')} className={`rounded-full border px-4 py-2 text-xs ${themeMode === 'light' ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-[color:var(--line-soft)] text-[color:var(--ink-muted)]'}`}>白间</button>
                  <button type="button" onClick={() => setThemeMode('night')} className={`rounded-full border px-4 py-2 text-xs ${themeMode === 'night' ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-[color:var(--line-soft)] text-[color:var(--ink-muted)]'}`}>夜间</button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs tracking-[0.14em] text-[color:var(--ink-faint)]">上传背景音乐</p>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUploadMusic(file);
                    }
                  }}
                  className="w-full rounded-[12px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm"
                />
                <p className="mt-2 text-xs text-[color:var(--ink-faint)]">当前音乐：{musicFileName || '未上传'}</p>
                {musicUploading ? <p className="mt-1 text-xs text-[color:var(--accent)]">音乐上传中...</p> : null}
              </div>
            </div>

            {uiConfigError ? (
              <p className="mt-3 text-sm text-[color:var(--accent)]">{uiConfigError}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setUiConfigOpen(false)} className="rounded-full border border-[color:var(--line-soft)] px-5 py-2 text-xs">取消</button>
              <button
                type="button"
                disabled={uiConfigSaving}
                onClick={() => void handleSaveUiConfig()}
                className="rounded-full bg-[color:var(--ink-strong)] px-5 py-2 text-xs text-[color:var(--paper)] disabled:opacity-60"
              >
                {uiConfigSaving ? '保存中' : '保存配置'}
              </button>
            </div>
          </PaperPanel>
        </div>
      ) : null}

      <SuccessOverlay
        open={!!successTip}
        title={successTip?.title || ''}
        description={successTip?.description}
        onClose={() => setSuccessTip(null)}
      />
    </div>
  );
}
