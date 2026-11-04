'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: string;
  contact_mode: string;
  location: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
  source_tags: Array<{ tag_id: string; tags: { id: string; name: string } }> | null;
}

const SOURCE_TYPES: Record<string, string> = {
  partner: '找搭子',
  second_hand: '二手交易',
  lost_found: '失物招领',
  experience: '校园经验',
};

export default function ReviewPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SourceItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/review');
      const data = await res.json();
      setSources(data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await apiFetch(`/api/review/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      fetchPending();
      setSelected(null);
    } catch {
      // ignore
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    try {
      await apiFetch(`/api/review/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', reject_reason: rejectReason }),
      });
      setShowRejectModal(false);
      setRejectReason('');
      setSelected(null);
      fetchPending();
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">审核后台</h1>
        <p className="text-sm text-gray-500 mt-1">审核用户提交的信息源</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-1 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12 text-gray-400">暂无待审核内容</div>
          ) : (
            sources.map((source) => (
              <button
                key={source.id}
                onClick={() => setSelected(source)}
                className={cn(
                  'w-full text-left bg-white rounded-lg border p-3 transition-colors',
                  selected?.id === source.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                    {SOURCE_TYPES[source.type] || source.type}
                  </span>
                </div>
                <h3 className="font-medium text-sm text-gray-800 truncate">{source.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {source.profiles?.display_name} · {new Date(source.created_at).toLocaleDateString('zh-CN')}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                  {SOURCE_TYPES[selected.type] || selected.type}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">待审核</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">{selected.title}</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap mb-4">{selected.content}</p>

              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <span className="text-gray-400">发布者：</span>
                  <span className="text-gray-700">{selected.profiles?.display_name}</span>
                </div>
                <div>
                  <span className="text-gray-400">地点：</span>
                  <span className="text-gray-700">{selected.location || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400">联系方式：</span>
                  <span className="text-gray-700">
                    {selected.contact_mode === 'platform' ? '平台内联系' : selected.contact_mode === 'masked' ? '打码显示' : '公开'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">发布时间：</span>
                  <span className="text-gray-700">{new Date(selected.created_at).toLocaleString('zh-CN')}</span>
                </div>
              </div>

              {selected.source_tags && selected.source_tags.length > 0 && (
                <div className="flex gap-1 mb-6">
                  {selected.source_tags.map((st) => (
                    <span key={st.tag_id} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      {st.tags?.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleApprove(selected.id)}
                  className="px-6 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                >
                  通过
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="px-6 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  驳回
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              选择左侧条目查看详情
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">驳回原因</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-24 resize-none"
              placeholder="请填写驳回原因..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
