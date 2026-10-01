const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const componentCode = `
import TeleSalesRecruitment, { TeleSalesSuccess } from './pages/TeleSalesRecruitment';

const TeleSalesPage = () => {
  const [appId, setAppId] = useState<string | null>(null);
  if (appId) {
    return <TeleSalesSuccess appId={appId} onReturn={() => setAppId(null)} />;
  }
  return <TeleSalesRecruitment onSuccess={(id) => setAppId(id)} />;
};
`;

if (!content.includes('TeleSalesPage')) {
    content = content.replace(
        "import { useGlobalAutofillTracker }", 
        componentCode + "\nimport { useGlobalAutofillTracker }"
    );
}

const routeCode = `<Route path="/telesales" element={<TeleSalesPage />} />`;
if (!content.includes('path="/telesales"')) {
    content = content.replace(
        "{/* Tele-Sales Recruitment */}",
        "{/* Tele-Sales Recruitment */}\n            " + routeCode
    );
}

fs.writeFileSync('src/App.tsx', content);
console.log("App.tsx has been safely updated!");
