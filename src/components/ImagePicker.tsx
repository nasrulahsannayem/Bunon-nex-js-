import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

const MEDIA_API = '/api/admin/media';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });

export default function ImagePicker({ value, onChange, label }: Props) {
  const [tab, setTab] = useState<'upload' | 'url'>(value ? 'url' : 'upload');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${MEDIA_API}/upload`, { method: 'POST', headers: auth(), body: fd });
      const d = await r.json();
      if (d.ok && d.url) onChange(d.url);
      else alert(d.msg || 'আপলোড ব্যর্থ');
    } catch {
      alert('আপলোড ব্যর্থ');
    }
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-semibold text-gray-700">{label}</label>}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button type="button" onClick={() => setTab('upload')}
          className={`px-3 py-1 rounded-md text-sm ${tab === 'upload' ? 'bg-white shadow font-semibold' : 'text-gray-500'}`}>আপলোড</button>
        <button type="button" onClick={() => setTab('url')}
          className={`px-3 py-1 rounded-md text-sm ${tab === 'url' ? 'bg-white shadow font-semibold' : 'text-gray-500'}`}>URL</button>
      </div>
      {tab === 'upload' ? (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-3 text-sm cursor-pointer bg-gray-50 hover:bg-gray-100">
          {uploading ? 'আপলোড হচ্ছে...' : 'ছবি বেছে নিন / ড্রপ করুন'}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && doUpload(e.target.files[0])} />
        </label>
      ) : (
        <input className="w-full border rounded-lg p-2 text-sm" placeholder="ছবির URL পেস্ট করুন"
          value={value} onChange={e => onChange(e.target.value)} />
      )}
      {value && (
        <div className="relative w-fit">
          <img src={value} alt="প্রিভিউ" className="h-20 w-20 object-cover rounded-lg border"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <button type="button" title="Clear image" onClick={() => onChange('')}
            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-none">×</button>
        </div>
      )}
    </div>
  );
}
