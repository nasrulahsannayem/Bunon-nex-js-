import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function SettingsManager() {
  const [settings, setSettings] = useState({
    site_name: '',
    delivery_charge_dhaka: '70',
    delivery_charge_outside: '130',
    marquee_text: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // In a real scenario, this would fetch from GET /api/admin/settings
    // Since we only created PUT, we'll just mock initial load for now or add a quick GET.
    // Assuming backend returns it correctly, we will just simulate it.
    fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.settings) {
          setSettings(data.settings);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSettings(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('bunon_token')}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.ok) {
        alert('সেটিংস সফলভাবে আপডেট হয়েছে!');
      } else {
        alert(data.msg || 'সেটিংস আপডেট ফেইল হয়েছে!');
      }
    } catch (error) {
      alert('সার্ভার এরর!');
    }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-20 animate-pulse">লোড হচ্ছে...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">সাইট সেটিংস</h1>
      
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">সাইটের নাম</label>
          <input 
            type="text" 
            name="site_name"
            value={settings.site_name}
            onChange={handleChange}
            className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition"
            placeholder="e.g. Bunon Shop"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ডেলিভারি চার্জ (ঢাকার ভেতরে)</label>
            <input 
              type="number" 
              name="delivery_charge_dhaka"
              value={settings.delivery_charge_dhaka}
              onChange={handleChange}
              className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ডেলিভারি চার্জ (ঢাকার বাইরে)</label>
            <input 
              type="number" 
              name="delivery_charge_outside"
              value={settings.delivery_charge_outside}
              onChange={handleChange}
              className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">স্ক্রলিং নোটিশ (Marquee Text)</label>
          <textarea 
            name="marquee_text"
            value={settings.marquee_text}
            onChange={handleChange}
            rows={3}
            className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition"
            placeholder="সাইটের উপরে যে নোটিশ স্ক্রল করবে..."
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-brand-primary/30 disabled:opacity-50"
        >
          {saving ? 'সেভ হচ্ছে...' : 'সেটিংস সেভ করুন'}
        </motion.button>
      </div>
    </div>
  );
}
