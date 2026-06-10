const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'messages');
const locales = {
  'en-IN.json': {
    trialPerks: "No credit card required • 15-day trial • Guided onboarding included",
    schema: {
      tryActionName: "Start free trial",
      offerDescription: "15-day trial for new workspaces",
      featureList: [
        "Invoicing and proposals",
        "Cash flow and expense tracking",
        "Multi-currency support",
        "Tax and compliance workflows"
      ]
    }
  },
  'es.json': {
    trialPerks: "No se requiere tarjeta de crédito • Prueba de 15 días • Incorporación guiada incluida",
    schema: {
      tryActionName: "Iniciar prueba gratuita",
      offerDescription: "Prueba de 15 días para nuevos espacios de trabajo",
      featureList: [
        "Facturación y propuestas",
        "Flujo de caja y seguimiento de gastos",
        "Soporte multidivisa",
        "Flujos de trabajo fiscales y de cumplimiento"
      ]
    }
  },
  'hi.json': {
    trialPerks: "क्रेडिट कार्ड की आवश्यकता नहीं • 15-दिवसीय परीक्षण • निर्देशित ऑनबोर्डिंग शामिल है",
    schema: {
      tryActionName: "मुफ़्त परीक्षण शुरू करें",
      offerDescription: "नए वर्कस्पेस के लिए 15-दिवसीय परीक्षण",
      featureList: [
        "चालान और प्रस्ताव",
        "नकदी प्रवाह और व्यय ट्रैकिंग",
        "बहु-मुद्रा समर्थन",
        "कर और अनुपालन वर्कफ़्लो"
      ]
    }
  },
  'ar.json': {
    trialPerks: "لا يتطلب بطاقة ائتمان • تجربة لمدة 15 يومًا • يتضمن إعدادًا موجهًا",
    schema: {
      tryActionName: "ابدأ التجربة المجانية",
      offerDescription: "تجربة لمدة 15 يومًا لمساحات العمل الجديدة",
      featureList: [
        "الفواتير والمقترحات",
        "تتبع التدفق النقدي والنفقات",
        "دعم متعدد العملات",
        "سير عمل الضرائب والامتثال"
      ]
    }
  }
};

for (const [file, content] of Object.entries(locales)) {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Patch Landing.hero.trialPerks
    if (!data.Landing) data.Landing = {};
    if (!data.Landing.hero) data.Landing.hero = {};
    data.Landing.hero.trialPerks = content.trialPerks;
    
    // Patch LandingPageSeo.schema
    if (!data.LandingPageSeo) data.LandingPageSeo = {};
    data.LandingPageSeo.schema = content.schema;
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
}
