import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { messageAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import EmptyState from '../../../components/common/EmptyState';
import { toast } from 'react-toastify';

export default function CitizenMessages() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [inbox, setInbox] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [reply, setReply] = useState('');
  const [composing, setComposing] = useState(false);
  const [newMsg, setNewMsg] = useState({ recipientId:'', subject:'', content:'' });

  useEffect(() => {
    messageAPI.getInbox().then(r => { setInbox(r.data.messages); setLoading(false); });
    messageAPI.getContacts({ role: 'admin' }).then(r => setContacts(r.data.users));
  }, []);

  const openConversation = async (msg) => {
    setSelected(msg);
    const r = await messageAPI.getConversation(msg.conversationId);
    setThread(r.data.messages);
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const other = thread.find(m => m.sender._id !== user._id);
    await messageAPI.send({ recipientId: other?.sender._id || selected.sender._id, content: reply, parentMessageId: selected._id });
    toast.success(t('dashboard.replySent'));
    setReply('');
    const r = await messageAPI.getConversation(selected.conversationId);
    setThread(r.data.messages);
  };

  const sendNew = async (e) => {
    e.preventDefault();
    await messageAPI.send(newMsg);
    toast.success(t('dashboard.messageSent'));
    setComposing(false);
    setNewMsg({ recipientId:'', subject:'', content:'' });
    messageAPI.getInbox().then(r => setInbox(r.data.messages));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('dashboard.messages')}</h2>
        <button onClick={() => { setComposing(true); setSelected(null); }} className="btn-primary text-sm py-2 px-4">+ {t('dashboard.newMessage')}</button>
      </div>

      {composing && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.newMessage')}</h3>
          <form onSubmit={sendNew} className="space-y-3">
            <select value={newMsg.recipientId} onChange={e => setNewMsg(p => ({ ...p, recipientId: e.target.value }))} required className="input-field">
              <option value="">{t('dashboard.selectRecipient')}</option>
              {contacts.map(c => <option key={c._id} value={c._id}>{c.fullName} ({c.role})</option>)}
            </select>
            <input value={newMsg.subject} onChange={e => setNewMsg(p => ({ ...p, subject: e.target.value }))} placeholder={t('dashboard.subject')} className="input-field" />
            <textarea value={newMsg.content} onChange={e => setNewMsg(p => ({ ...p, content: e.target.value }))} required rows={4} placeholder={t('dashboard.yourMessage')} className="input-field" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setComposing(false)} className="btn-secondary text-sm px-4">{t('common.cancel')}</button>
              <button type="submit" className="btn-primary text-sm px-4">{t('dashboard.send')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Inbox list */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 font-semibold text-sm text-gray-700 dark:text-gray-300">{t('dashboard.inbox')} ({inbox.length})</div>
          {inbox.length === 0 ? <EmptyState icon="💬" title={t('dashboard.noMessages')} description={t('dashboard.inboxEmpty')} /> : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {inbox.map(m => (
                <div key={m._id} onClick={() => openConversation(m)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selected?._id === m._id ? 'bg-primary-50 dark:bg-primary-900/20' : ''} ${!m.isRead ? 'font-medium' : ''}`}>
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{m.sender?.fullName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.subject || m.content}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(m.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thread view */}
        <div className="lg:col-span-3 card">
          {!selected ? (
            <EmptyState icon="💬" title={t('dashboard.selectMessage')} description={t('dashboard.selectMessageDesc')} />
          ) : (
            <div className="flex flex-col h-full gap-3">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2">{selected.subject || t('dashboard.message')}</h3>
              <div className="space-y-3 flex-1 overflow-y-auto max-h-72">
                {thread.map(m => (
                  <div key={m._id} className={`p-3 rounded-xl text-sm max-w-[85%] ${m.sender._id === user._id ? 'ml-auto bg-primary-100 text-primary-900 dark:bg-primary-900/40 dark:text-primary-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                    <p className="font-medium text-xs mb-1">{m.sender.fullName}</p>
                    <p>{m.content}</p>
                    <p className="text-xs opacity-60 mt-1">{new Date(m.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder={t('dashboard.writeReply')} className="input-field flex-1 text-sm" />
                <button onClick={sendReply} className="btn-primary text-sm px-4 self-end">{t('dashboard.send')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
