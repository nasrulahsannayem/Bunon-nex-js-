/**
 * How to address a customer: ভাই (brother), আপু (sister) or neither.
 *
 * Getting this wrong is worse than getting it neutral — calling a woman "ভাই"
 * is a bad first impression on the very first message she reads from the shop.
 * So the resolver only speaks when the name is clear, and otherwise stays
 * silent about kinship rather than guessing.
 *
 * Evidence, strongest first:
 *   1. an override the owner saved in the admin
 *   2. a name part only ever used by women
 *   3. a name part common for men
 *   4. a feminine Bengali ending
 *   5. nothing -> neutral, no kinship word
 */

// Words that appear in test orders and as literal placeholders. Never a name.
const NOISE = new Set([
  'customer', 'test', 'testing', 'shopify', 'ecom', 'unknown', 'na', 'none',
  'name', 'admin', 'user', 'demo', 'guest', 'buyer', 'order', 'ecommerce',
]);

// Stripped before reading the name. "মোঃমো" collapses to "মো" after the first
// pass, so the stripping loop runs more than once.
const HONORIFICS =
  /^(?:মোঃ|মো:|মোঃমো|মো|m\/s|md\.?|mst\.?|mr\.?|mrs\.?|ms\.?|miss|মেস|আল্লাহু|আপনার|এমসি|এমঃ|আব্দুল|abdul)\s*/i;

// Names used by women. Checked in both the given and the family position,
// because entries like শাহিনা appear as a given name and খাতুন as a surname.
const FEMALE = new Set([
  'খাতুন', 'khatun', 'বেগম', 'begum', 'আক্তার', 'akter', 'বানু', 'banu',
  'সুলতানা', 'sultana', 'যসমিন', 'yazmin', 'yasmin', 'নাসরিন', 'nasrin',
  'পারভীন', 'parvin', 'parveen', 'রুবাইয়াত', 'rubaiyat', 'জাহান', 'jahan',
  'আনজুম', 'anjum', 'শাহিনা', 'shahina', 'নার্গিস', 'nargis', 'সালেহা', 'saleha',
  'মোমতাজ', 'momtaz', 'হাসিনা', 'hasina', 'খাদিজা', 'khadija', 'রহিমা', 'rahima',
  'করিমা', 'karima', 'নাসিমা', 'nasima', 'ফরিদা', 'farida', 'সামিনা', 'samina',
  'শার্মিন', 'sharmin', 'তাহমিনা', 'tahmina', 'মোমেনা', 'momena', 'রেজিনা', 'regina',
  'ফাতেমা', 'fatema', 'fatima', 'আয়েশা', 'ayesha', 'আয়শা', 'aisha', 'নাহিদ', 'nahid',
  'সাফিনা', 'safina', 'নাবিলা', 'nabila', 'নুসিবা', 'nusiba', 'সাবিনা', 'sabina',
  'জান্নাত', 'jannat', 'সাদিকা', 'sadika', 'তাসনিম', 'tasnim', 'সুমাইয়া', 'sumaiya',
  'রফিকা', 'rafiqa', 'নিমু', 'nimu', 'লামিসা', 'lamisa', 'আফিয়া', 'afiya',
  'মারিয়া', 'maria', 'সাদিয়া', 'sadia', 'রুবিনা', 'rubina', 'সালমা', 'salma',
  'রুমানা', 'rumana', 'অঞ্জলি', 'anjali', 'পূজা', 'puja', 'মালা', 'mala',
  'শাম্মা', 'shamma', 'শামসা', 'shamsa', 'আনিসা', 'anisa', 'রোকসানা', 'roksana', 'rokhsana', 'রুকসানা',
  'নাজমা', 'najima', 'মেঘলা', 'meghla', 'মোমতাজা', 'momtaja', 'সেলিনা', 'selina',
  'তানজিয়া', 'tanjia', 'শবনম', 'shabnam', 'তানজিনা', 'tanjina', 'রুবাইয়া', 'rubaiya',
  'শেরিন', 'sherin', 'ইমরানা', 'imrana', 'নুসরাত', 'nusrat', 'জোয়েলা', 'joila',
  'কোমলা', 'komala', 'সাধনা', 'sadhona', 'মিতালি', 'mitali', 'উমা', 'uma',
]);

// Names used by men. Bangladeshi given names are overwhelmingly male, so this
// list is deliberately shorter.
const MALE = new Set([
  'islam', 'ইসলাম', 'hossain', 'hussain', 'hossein', 'হোসেন', 'ahmed', 'আহমদ',
  'ahsan', 'আহসান', 'rahman', 'রহমান', 'rahim', 'রহিম', 'karim', 'করিম',
  'hasan', 'হাসান', 'hassan', 'ali', 'আলী', 'alam', 'আলম', 'uddin', 'উদ্দিন',
  'kabir', 'কবির', 'rakib', 'রাকিব', 'sohel', 'সোহেল', 'sumon', 'সুমন',
  'faruk', 'ফারুক', 'amin', 'আমিন', 'nasrul', 'নাসরুল', 'nayem', 'নায়েম',
  'nayeem', 'নায়ীম', 'juwel', 'জুয়েল', 'rubel', 'রুবেল', 'monir', 'মনির',
  'masum', 'মাসুম', 'masud', 'মাসুদ', 'nizam', 'নিজাম', 'shakib', 'শাকিব',
  'arif', 'আরিফ', 'billal', 'বিলাল', 'imran', 'ইমরান', 'jamal', 'জামাল',
  'akram', 'আকরাম', 'shahjahan', 'শাহজাহান', 'mostafa', 'মোস্তাফা', 'siraj', 'সিরাজ',
  'raju', 'রাজু', 'sifat', 'সিফাত', 'khairul', 'খায়েরুল', 'mohammad', 'mohammed',
  'মোহাম্মদ', 'আবুল', 'abul', 'abu', 'আবু', 'jashim', 'জসিম', 'nirob', 'নিরব',
  'sobuj', 'সবুজ', 'tariq', 'তারিক', 'tanvir', 'তানভীর', 'asif', 'আসিফ',
  'fahim', 'ফাহিম', 'hafiz', 'হাফিজ', 'sajid', 'সাজিদ', 'javed', 'জাভেদ',
  'munir', 'মুনির', 'shafiq', 'শফিক', 'aminul', 'আমিনুল',
]);

// Bengali feminine endings: নাজমা, মেঘলা, রহমা, শামসা.
const FEMININE_ENDING = /(?:া|ী|য়া|মা|না|তা|শা|ষা|সা|ন)$/;
const FEMININE_ISH = /[া-ৎ]/;

export type Honorific = 'ভাই' | 'আপু' | '';

function norm(s: string): string {
  return String(s || '').replace(/[।॥]/g, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function stripHonorifics(raw: string): string {
  let cur = norm(raw);
  let prev = '';
  for (let i = 0; i < 4 && cur !== prev; i++) {
    prev = cur;
    cur = cur.replace(HONORIFICS, '').trim();
  }
  return cur;
}

export function resolveFirstName(customerName: string): string {
  const parts = stripHonorifics(customerName).split(' ').filter(Boolean);
  return parts.length ? parts[0] : '';
}

/**
 * @param customerName full name as recorded on the order
 * @param override     'ভাই' | 'আপু' | '' set by the owner in the admin
 */
export function resolveHonorific(customerName: string, override?: Honorific | null): Honorific {
  // An explicit choice always wins, including an explicit "say neither".
  if (override === 'ভাই' || override === 'আপু') return override;
  if (override === '') return '';

  const parts = stripHonorifics(customerName).split(' ').filter(Boolean);
  if (!parts.length) return '';

  const given = parts[0].toLowerCase();
  const surname = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  if (NOISE.has(given) || NOISE.has(surname)) return '';

  // A woman's name anywhere outranks a man's surname, because জান্নাত হাসান is
  // a woman and হাসান is not a reliable male signal on its own.
  if (FEMALE.has(given) || FEMALE.has(surname)) return 'আপু';
  if (MALE.has(given)) return 'ভাই';

  // Feminine ending on the given name, unless a known male surname contradicts.
  if (FEMININE_ENDING.test(given) && FEMININE_ISH.test(given) && given.length >= 3) {
    if (MALE.has(surname)) return 'ভাই';
    return 'আপু';
  }
  if (MALE.has(surname)) return 'ভাই';

  // Nothing conclusive: say nothing about kinship.
  return '';
}

/** "রাকিব ভাই" / "ফাতেমা আপু" / just "রাকিব" / "ভাই/বোন" as a last resort. */
export function resolveGreeting(customerName: string, override?: Honorific | null): string {
  const name = resolveFirstName(customerName);
  const h = resolveHonorific(customerName, override);
  if (!name || NOISE.has(name.toLowerCase())) return 'ভাই/বোন';
  return h ? `${name} ${h}` : name;
}