/* ═══════════════════════════════════════════════════════════════
   SMART FILL: LABEL DICTIONARY (E4) and NUMBER GRAMMAR (E3).
   Built-in synonyms, French starter terms, veto terms, plausibility
   ranges and routing per field. The owner edits all of it in the Studio
   (settings.smartfill); the catalogue itself is read at run time from
   the form, so renamed labels and custom inputs are found too.
   ═══════════════════════════════════════════════════════════════ */
/* id | English synonyms ; ... | French synonyms | veto terms | range lo,hi | flags
   flags: c=<claim field> (a narrative document fills this one instead), p=<field 12 months earlier>, n (narrative documents may fill it at full
   confidence), m=<words one of which must appear>, x (never filled from documents: the investor's own assumption) */
const SF_DICT_SRC = `arr_now|arr;annual recurring revenue;arr today;current arr;closing arr;ending arr;run rate;arr run rate;annualized recurring revenue;arr (current)|arr;revenu récurrent annuel;chiffre d affaires récurrent annuel|per employee;per fte;per head;target;goal;competitor;net new;new logo;new-logo;expansion;churn;contraction;opening;bridge total;pipeline;12 months ago;prior year;last year;a year ago|1000,2e10|c=stated_arr;p=arr_12mo
arr_12mo|arr 12 months ago;opening arr;beginning arr;arr a year ago;arr last year;arr prior year;starting arr;arr 12 months ago;arr one year ago|arr il y a 12 mois;arr de l année dernière|per employee|1000,2e10|
new_arr_l12|new logo arr;new-logo arr;new customer arr;new business arr;arr from new customers;new arr;new logos arr|nouveaux clients arr|net new;expansion;upsell|0,1e10|
expansion_arr_l12|expansion arr;expansion;upsell arr;upsell;expansion revenue|expansion|contraction;new|0,1e10|
churned_arr_l12|churned arr;churn arr;lost arr;arr churned;churn;arr lost to churn|arr perdu;attrition|logo;logos;rate;%;contraction|0,1e10|a
contraction_arr_l12|contraction arr;contraction;downgrade arr;downgrades|contraction|expansion|0,1e10|a
gross_margin|gross margin;gross margin incl customer success;gm;gross margin %;gross profit margin|marge brute;taux de marge brute|burn;excl customer success;excluding customer success;excl. customer success;target;12 months ago;prior year|-50,100|
cogs_hosting|hosting and infrastructure;hosting;infrastructure cost;cloud cost;hosting cost;inference cost;hosting / inference cost|hébergement;coût d hébergement|revenue;income;sales|0,5e9|
cogs_support|support and delivery;support cost;customer support cost;delivery cost;support & delivery|coût du support|revenue;income;headcount|0,5e9|
services_pct|services revenue share;non recurring revenue share;professional services %;services %|part des services||0,100|
pct_annual|annual contracts share;arr on annual terms;annual or longer contracts|contrats annuels||0,100|
deferred_revenue|deferred revenue;deferred revenue balance;unearned revenue;contract liabilities;deferred revenue closing balance|produits constatés d avance;revenus différés||0,5e9|
ar_over_90|receivables over 90 days;ar over 90 days;over 90 days;91+ days;90+ days|créances à plus de 90 jours||0,5e9|
cash_on_hand|cash;cash and equivalents;cash and cash equivalents;cash balance;cash on hand;bank balance;available balance;available balance excluding restricted cash;ending balance;closing balance;ending cash;closing cash;cash as of|trésorerie;disponibilités;solde de trésorerie|burn;flow;restricted;collateral;target;opening;12 months ago;cash burn;consumption;monthly;per month;outflow;deferred;revenue;receivable;receivables|0,5e10|
net_burn|net burn;monthly net burn;net burn rate;net cash burn;burn;cash burn;net burn (monthly average);monthly burn|consommation nette de trésorerie;consommation nette;burn net|gross;multiple;target|0,5e8|
gross_burn|gross burn;gross burn rate;gross monthly burn;total cash expenses;monthly opex|consommation brute;burn brut|net;multiple|0,5e8|
total_raised|total raised;total equity raised;capital raised to date;raised to date;total funding|total levé;fonds levés||0,5e10|
pre_money|pre-money at last round;last round pre-money;previous pre-money|valorisation pré-money du dernier tour|offered;this round|0,1e11|m=last round;previous;prior round;dernier tour
safes_outstanding|safes outstanding;safe principal;safes;safe amount;principal|safes en cours||0,1e9|m=safe
notes_principal|convertible notes outstanding;note principal;notes principal;principal|obligations convertibles||0,1e9|m=note;notes;lender;bridge
debt_outstanding|venture debt;debt outstanding;loan balance;term loan|dette||0,1e10|
months_since_round|months since last round|mois depuis le dernier tour||0,240|
customers_now|customers;paying customers;active customers;customer count;number of customers;logos;clients|clients;nombre de clients;clients payants|success;satisfaction;support;acquisition;lifetime;per customer;target;goal;competitor;12 months ago;prior year;new customers;lost;churned;concentration;top;receipts;payments;account;research;survey|1,1e8|c=stated_customers;p=customers_12mo
customers_12mo|customers 12 months ago;customers a year ago;customers last year;opening customers|clients il y a 12 mois||1,1e8|
logos_lost_l12|logos lost;logos churned;customers lost;churned customers;logo churn;logos churned ltm|clients perdus|arr;rate;%|0,1e7|
top1_pct|largest customer share;top customer share;largest customer % of arr;top 1 customer|premier client||0,100|
top5_pct|top 5 customers share;top five customers;top 5 share;top 5 customers % of arr|5 premiers clients||0,100|
top10_pct|top 10 customers share;top ten customers;top 10 share|10 premiers clients||0,100|
sm_spend_l12|sales and marketing;sales & marketing spend;s&m spend;sales and marketing expense;s&m|ventes et marketing;dépenses commerciales|headcount;quarter;q1;q2;q3;q4|0,5e9|
new_customers_l12|new customers;new logos;new customers won;customers won|nouveaux clients|arr;lost|0,1e7|
sm_spend_prior_q|s&m spend last quarter;sales and marketing last quarter||headcount|0,5e9|m=quarter;q1;q2;q3;q4
new_arr_prior_q|net new arr last quarter;net new arr quarter;net new arr q||ltm;12 months|0,1e10|m=quarter;q1;q2;q3;q4
win_rate|win rate;close rate;win rate (last 12 months);win rate on qualified opportunities|taux de conversion;taux de réussite|against;vs;versus;head to head|0,100|
sales_cycle|sales cycle;median sales cycle;average sales cycle;days to close;time to close|cycle de vente||1,1000|
pipeline_coverage|pipeline coverage;coverage;pipeline coverage ratio|couverture du pipeline||0,50|
quota_attainment|quota attainment;reps at quota;reps at or above quota;attainment|atteinte des quotas||0,300|
pct_paid|paid acquisition share;new arr from paid|acquisition payante||0,100|
headcount_now|headcount;team;employees;fte;ftes;team size;people;staff;total headcount|effectif;salariés;équipe|engineering;sales;12 months ago;open roles;cost;per employee;per fte;arr per|1,1e6|p=headcount_12mo
headcount_12mo|headcount 12 months ago;team a year ago|effectif il y a 12 mois||1,1e6|
headcount_eng|engineering;engineering headcount;engineers;r&d headcount|ingénierie;ingénieurs|departures;cost|0,1e5|
headcount_sales|sales;sales headcount;sales & marketing headcount;sales team|commerciaux|spend;marketing spend;cycle;win|0,1e5|
avg_loaded_comp|average fully loaded cost per employee;loaded cost per employee;average loaded cost;cost per employee|coût moyen chargé par salarié||10000,2e6|
founders_count|founders;number of founders|fondateurs||1,10|
founder_max_equity|largest founder stake;founder ownership|participation du fondateur||0,100|
founder_domain_years|years in domain||||0,60|x
prior_exit|prior exit|||||n
founder_departed|cofounder left|||||
founders_years_together|years founders worked together||||0,60|n
technical_founder|technical founder|||||n
eng_departures_l12|engineering departures;engineers who left|départs ingénieurs||0,1e4|
target_accounts|target accounts;icp accounts;accounts that match the icp;addressable accounts|comptes cibles||1,1e9|n
reachable_pct|reachable through current channels;reachable;realistically reachable|atteignables||0,100|n
primary_competitor|primary competitor;main competitor;closest competitor|principal concurrent||||n
win_rate_vs_primary|win rate against;win rate vs;head to head win rate|taux de victoire contre||0,100|n;m=against;vs;versus;head;contre
pricing_move|pricing|prix|||n
switching_cost|switching cost|coût de changement|||n
regulated_market|regulated|réglementé|||n
moat_type|moat;defensibility|avantage concurrentiel|||n
patents|patents granted or filed;patents|brevets||0,1e5|n
mission_critical|mission critical||||n
pmf_very_disappointed|very disappointed;sean ellis|très déçus||0,100|n
pmf_respondents|respondents;survey respondents|répondants||1,1e7|n;m=respondent;n=
nps|net promoter score;nps|nps|benchmark;industry;category;peer|-100,100|n
why_now|why now|pourquoi maintenant|||n
seat_util|seat utilization;seats used;active seats|utilisation des licences||0,100|
usage_based_pct|usage based revenue|revenu à l usage||0,100|
inference_pct|inference cost share;inference % of revenue|coût d inférence||0,100|
gm_12mo|gross margin 12 months ago;gross margin prior year|marge brute il y a 12 mois||-50,100|
top_model_share|top model provider share||||0,100|
proprietary_data|proprietary data|données propriétaires||||
gmv_now|gmv;gross merchandise value;gmv run rate|volume d affaires|target;12 months ago|0,1e12|p=gmv_12mo
gmv_12mo|gmv 12 months ago||||0,1e12|
repeat_gmv_pct|repeat gmv;gmv from repeat buyers||||0,100|
contrib_margin|contribution margin|marge de contribution||-100,100|
incentives_pct|incentives % of gmv;subsidies||||0,100|
top_supplier_pct|top 10 suppliers share||||0,100|
loss_rate|loss rate;credit losses;fraud losses|taux de perte||0,100|
licence_model|licence;license||||
regulatory_findings|regulatory findings;consent order||||
volume_now|processed volume;tpv;total payment volume;originated volume|volume traité|target;12 months ago|0,1e13|p=volume_12mo
volume_12mo|volume 12 months ago||||0,1e13|
ip_assignments|ip assignment|cession de propriété intellectuelle||||
contractor_ip|contractor ip||||
chain_title|chain of title||||
captable_documented|cap table documented||||
taxes_current|taxes|impôts;taxes||||
liq_pref|liquidation preference on the senior series;existing liquidation preference||||0,10|m=senior;existing;series a;prior
participating|participating preferred existing||||
option_pool|unallocated option pool;option pool unallocated;option pool: unallocated;unallocated pool|pool d options non attribué|granted;target;post-money|0,100|
founder_vesting|founder vesting;vesting|acquisition progressive||||
litigation|litigation;lawsuit|litige;contentieux||||
audited_financials|audited;financial statements|comptes audités||||
funds_separate|separate accounts||||
valuation_409a|409a||||
insurance_dno|d&o insurance;directors and officers insurance|assurance rc des dirigeants||||
soc2|soc 2;soc2||||
uptime_90d|uptime;availability;uptime (trailing 90 days)|disponibilité||50,100|
p1_incidents|severity-1 incidents;sev1 incidents;p1 incidents;critical incidents;severity 1 incidents|incidents critiques||0,1e4|
infra_single_vendor|single infrastructure vendor||||
model_single_vendor|single model provider||||
dpas_signed|data processing agreements;dpa|accords de traitement des données||||
oss_reviewed|open-source licences;open source review||||
stated_arr|arr as stated||||1000,2e10|
stated_growth|yoy growth;yoy;growth;year over year growth;arr growth;annual growth;growth rate|croissance annuelle;croissance|market;industry;target;goal;competitor;headcount;team|-100,10000|
stated_runway|runway;months of runway|durée de vie de la trésorerie;runway;mois de trésorerie|target|0,600|
stated_nrr|net revenue retention;nrr;net dollar retention;ndr;net retention|rétention nette du revenu;rétention nette;nrr|gross;target;benchmark;industry|0,400|
stated_grr|gross revenue retention;grr;gross dollar retention;gdr;gross retention|rétention brute|net;target|0,100|
stated_rule40|rule of 40||||-200,400|
stated_burn_multiple|burn multiple||||-10,100|
stated_magic_number|magic number||||-10,20|
stated_cac|cac;customer acquisition cost|coût d acquisition client|payback;ltv|0,1e7|
stated_cac_payback|cac payback;payback|délai de récupération||0,240|
stated_ltv_cac|ltv:cac;ltv/cac;ltv to cac|ltv/cac||0,100|
stated_acv|acv;average contract value|valeur moyenne des contrats||0,1e9|
stated_tam|tam;total addressable market;addressable market|marché adressable;marché total adressable|growth;grew|1e6,1e14|
stated_customers|customers as stated||||1,1e8|
stated_take_rate|take rate|taux de commission||0,100|
round_size|amount of financing;round size;raising;we are raising;raise;investment amount;new money|nous levons;montant de la levée|target;12 months|1e4,1e11|
round_pre_money|pre-money valuation;pre-money;pre money valuation|valorisation pré-money|last round;previous|1e5,1e12|
our_check|our cheque||||x
pool_target_post|option pool;unallocated option pool equal to;pool required post-money|pool d options||0,50|m=post-money;post money;pre-money valuation
new_liq_pref|liquidation preference|préférence de liquidation||0,10|
new_participating|participating|participatif||||
new_part_cap|participation cap;capped at||||0,20|
anti_dilution|anti-dilution|anti-dilution||||
board_after|board of directors;board|conseil d administration||||
cumulative_dividends|dividends|dividendes||||
redemption_rights|redemption|rachat||||
pay_to_play|pay-to-play;pay to play||||
pro_rata_rights|pro rata rights;pro rata;pro-rata|droit de suite||||
information_rights|information rights|droits d information||||
board_seat|board seat;observer seat||||
prior_investor_pct|prior investors stake||||0,100|
safe_cap|valuation cap;cap;post-money cap|plafond de valorisation||1e5,1e12|m=safe
safe_discount|discount|décote||0,100|m=safe
safe_list|safe list||||x
notes_rate|interest rate;rate;coupon|taux d intérêt||0,50|m=note;notes;lender;bridge
notes_months|months since issue||||0,240|x
notes_cap|valuation cap;cap|plafond||1e5,1e12|m=note;notes;lender;bridge
notes_discount|discount|décote||0,100|m=note;notes;lender;bridge
fund_size|fund size||||x
exit_multiple_assumption|exit multiple||||x
future_rounds|future rounds||||x
dilution_per_round|dilution per round||||x
years_to_exit|years to exit||||x
target_irr|target irr||||x
fc_rate|discount rate||||x
exit_arr_base|exit arr||||x
exit_arr_up|upside arr||||x
exit_value_down|downside value||||x
prob_down|downside probability||||x
prob_base|base probability||||x
prob_up|upside probability||||x`;

/* words that mark a value as not an actual (forecast, plan, someone else's figure) */
const SF_NOT_ACTUAL = /\b(forecast|plan|budget|target|goal|objective|projected|projection|pro forma|proforma|expected|we expect|estimate|outlook|guidance|next year|by end of|by the end of|competitor|competitors|market|industry|benchmark|peer|peers|category|objectif|prévision|prévu|prevu|budget|concurrent|marché|marche|set|fill|ignore|replace|pretend|assume|assumptions?|should be|would be|could be|could|if|hypothetical|scenario|example)\b|\b(fy|q[1-4])\s?'?\d{2,4}\s?(e|f|p|est|fcst)\b|\b20\d\d\s?(e|f|p)\b/i;
const SF_ACTUAL = /\b(actual|actuals|as of|as at|ltm|ttm|trailing|audited|closing|ending|current|today|réel|au \d)/i;

/* label text in one form (lower case, no accents, single spaces); remembered, because the same labels come back thousands of times */
const _sfNormMemo = new Map();
function sfNorm(s) {
  const k = String(s || ''); let v = _sfNormMemo.get(k); if (v !== undefined) return v;
  v = sfNorm0(k); if (_sfNormMemo.size > 50000) _sfNormMemo.clear(); _sfNormMemo.set(k, v); return v;
}
function sfNorm0(s) {
  return String(s || '').replace(/ß/g, 'ss').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe').replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[¹²³⁴*†‡]|\[\d+\]/g, ' ')
    .replace(/([a-z])[._]([a-z0-9])/g, '$1 $2').replace(/\b([a-z]{1,8})-(\d)\b/g, '$1$2').replace(/['’`]/g, ' ').replace(/[^a-z0-9%$€£+:/.-]+/g, ' ').replace(/\s[.:-]+\s|[.:]+$|^[.:-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
let _sfDict = null;
function sfDict() {
  if (_sfDict) return _sfDict;
  const own = (typeof CFG !== 'undefined' && CFG && CFG.settings && CFG.settings.smartfill) || {}, ownF = own.fields || {};
  let taught = {}; try { const a = JSON.parse(localStorage.getItem('vcr2-sf-aliases') || '{}'); if (a && typeof a === 'object' && !Array.isArray(a)) taught = a; } catch (e) {}
  const d = new Map(), intl = new Map();
  SF_DICT_INTL.split('\n').forEach(line => { const [id, syn, neg, must] = line.split('|'); intl.set(id, { syn:(syn || '').split(';'), neg:(neg || '').split(';'), must:(must || '').split(';') }); });
  SF_DICT_SRC.split('\n').forEach(line => {
    const [id, en, fr, neg, range, flags] = line.split('|'), f = { id, syn:[], neg:[], lo:-Infinity, hi:Infinity, claim:'', prior:'', narrative:false, must:[], skip:false };
    const o = ownF[id] || {}, xl = intl.get(id) || { syn:[], neg:[], must:[] };
    f.syn = [...new Set([...(en || '').split(';'), ...(fr || '').split(';'), ...xl.syn, ...(o.syn || []), ...(Array.isArray(taught[id]) ? taught[id].slice(0, 60).map(String) : [])].map(sfNorm).filter(Boolean))].filter(s => !(o.removeSyn || []).map(sfNorm).includes(s));
    f.neg = [...new Set([...(neg || '').split(';'), ...xl.neg, ...(o.neg || [])].map(sfNorm).filter(Boolean))];
    const [lo, hi] = (range || '').split(','); if (lo !== '' && lo != null) f.lo = +lo; if (hi) f.hi = +hi;
    if (o.range && o.range.length === 2) { f.lo = +o.range[0]; f.hi = +o.range[1]; }
    const [head, must] = (flags || '').split('m=');   /* the "must" list is always last: everything after m= */
    if (must != null) f.must = [...new Set(must.split(';').concat(xl.must).map(sfNorm).filter(Boolean))];
    head.split(';').forEach(fl => { const [k, v] = fl.split('='); if (k === 'c') f.claim = v; else if (k === 'p') f.prior = v; else if (k === 'n') f.narrative = true; else if (k === 'x') f.skip = true; else if (k === 'a') f.abs = true; });
    if (o.must) f.must = o.must.map(sfNorm);
    d.set(id, f);
  });
  return (_sfDict = d);
}

/* ── numbers: every number in a text, with its unit, currency, scale, sign, approximation and range ── */
const SF_MULT = { k:1e3, thousand:1e3, thousands:1e3, mille:1e3, tausend:1e3, tsd:1e3, duizend:1e3, mila:1e3, m:1e6, mm:1e6, mn:1e6, mln:1e6, mio:1e6, million:1e6, millions:1e6, millones:1e6, millon:1e6, mill:1e6, millionen:1e6, milioni:1e6, milione:1e6, milhoes:1e6, milhao:1e6, miljoen:1e6, miljoenen:1e6, mi:1e6,
  b:1e9, bn:1e9, billion:1e9, billions:1e9, md:1e9, mds:1e9, milliard:1e9, milliards:1e9, milliarden:1e9, miliardi:1e9, miliardo:1e9, miljard:1e9, miljarden:1e9, bilhoes:1e9, bilhao:1e9, mrd:1e9, mld:1e9, mia:1e9, bi:1e9 };
let _sfLangNow = 'en';   /* the language of the document being read (sfLang), set by the engine */
const SF_NUM_RE = /(~|≈|[<>≤≥]=?\s?|\bat (?:least|most)\s+|\bc\.\s?|\bca\.\s?|\b(?:about|approx\.?|approximately|roughly|around|nearly|almost|over|under|up to|more than|less than|above|below|environ|près de|plus de|moins de|aproximadamente|aprox\.?|alrededor de|cerca de|casi|más de|mas de|menos de|hasta|etwa|rund|ungefähr|knapp|mehr als|weniger als|bis zu|circa|quasi|oltre|più di|piu di|meno di|fino a|quase|mais de|até|ongeveer|bijna|ruim|meer dan|minder dan)\s+|über\s+)?(US\$|USD|EUR|GBP|CHF|\$|€|£)?\s?([-−\u2013]|\()?\s?(\d{1,3}(?:(?:[,.  ' ])\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?|[.,]\d+)(?:\s?(?:-|\u2013|to|à)\s?(?:US\$|\$|€|£)?(\d+(?:[.,]\d+)?))?\s?(?:(bn|billions?|billion|milliards?|milliarden|miliardi|miliardo|miljarden|miljard|bilhões|bilhoes|bilhão|bilhao|mrd|mld|mds|md|millones|millón|millon|millionen|milioni|milione|milhões|milhoes|milhão|milhao|miljoenen|miljoen|mill(?![a-z])|mm|mn|mln|mio|millions?|million|thousands?|mille|tausend|tsd|duizend|mila(?![a-z])|mil(?![a-z])|mia(?![a-z])|mi(?![a-z])|bi(?![a-z])|[kKmMbB](?![a-z]))(?:\.(?=\s?(?:€|£|\$|USD|EUR|GBP|CHF)))?)?\s?(€|£|\$|USD|EUR|GBP)?(\))?\s?(%|percent|per cent|pct|por ciento|prozent|per cento|por cento|procent|pts|points|bps|x(?![a-z])|×|months?|mos?\.?(?![a-z])|mois|meses|mes(?![a-z])|monaten|monate|monat|mesi|mese|maanden|maand|mnd|days?|jours|días|dias|tagen|tage|giorni|dagen|years?|yrs?|ans|años|anos|jahren|jahre|anni|jaren|jaar)?([¹²³⁴*†‡]|\[\d\])?/gi;
function sfLocale(text) {   /* "en" (1,234.5) or "eu" (1.234,5 / 1 234,5), decided per document */
  const t = String(text).slice(0, 200000);
  const eu = (t.match(/\d,\d{1,2}(?!\d)\s?(%|€|M€|k€|M\b)|\d{1,3}\.\d{3}\.\d{3}|\d \d{3},\d|\d \d{3}/g) || []).length;
  const en = (t.match(/\d\.\d{1,2}(?!\d)\s?(%|M\b|k\b|m\b|x\b)|\d{1,3},\d{3},\d{3}/g) || []).length;
  if (eu !== en) return eu > en ? 'eu' : 'en';
  /* no clear sign: weaker ones ("4,2 millones", "6.480", "1,250"), then the language of the document */
  const eu2 = (t.match(/\d,\d{1,2}(?!\d)|\b\d{1,3}(?:\.\d{3})+(?!\d)/g) || []).length, en2 = (t.match(/\d\.\d{1,2}(?!\d)|\b\d{1,3}(?:,\d{3})+(?!\d)/g) || []).length;
  if (eu2 !== en2) return eu2 > en2 ? 'eu' : 'en';
  return /^(es|de|it|pt|nl|fr)$/.test(sfLang(t)) ? 'eu' : 'en';
}
/* dates are not figures: blanked out (same length, so positions hold) before numbers and their labels are read */
function sfBlankDates(text) {
  return String(text == null ? '' : text).replace(/\b(19|20)\d\d-\d\d(-\d\d)?\b|\b\d{1,2}\/\d{1,2}\/(19|20)?\d\d\b|\b(?:au|as of|on|le|al|am|el|il|em|op|per|zum)\s\d{1,2}\/\d{1,2}\b|\b(19|20)\d\d\/\d\d(\/\d\d)?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[ -]\d{1,2}(,? (19|20)\d\d)?\b|\b\d{1,2}(?:er|\.)?\s(?:de\s)?(?:jan|feb|f[eé]v|m[aä]r|mrz|mrt|apr|avr|abr|ma[iy]|mag|mei|ju[nli]|giu|lug|aug|ago|ao[uû]|se[pt]|o[ck]t|ott|out|nov|d[eé]c|dez|dic|ene|gen)[a-zà-ÿ]*\.?\s(?:de\s)?(19|20)\d\d\b|\b(q[1-4]|t[1-4]|[1-4]t|h[12]|s[12]|fy|gj|ej)\s?'?(19|20)?\d\d\b|\b(?:in|by|since|until|en|fin|end of|im|seit|bis|ende|nel|dal|desde|hasta|em|sinds|eind|depuis)\s(?:19|20)\d\d\b(?![.,]\d)(?!\s?(?:[%kKmMbB$€£]|bn\b|million))|\bsoc\s?[12]\b|\biso\s?\d{4,5}\b|\bsev(erity)?[- ]?[0-4]\b|\bp[0-4]\b/gi, x => ' '.repeat(x.length)).replace(SF_DAY_MONTH, x => ' '.repeat(x.length));
}
function sfNumbers(text, ctx) {
  ctx = ctx || {}; const out = [];
  const s = sfBlankDates(text);
  SF_NUM_RE.lastIndex = 0; let m;
  while ((m = SF_NUM_RE.exec(s))) {
    if (m[0].trim() === '' || !/\d/.test(m[4])) { if (!m[0]) SF_NUM_RE.lastIndex++; continue; }
    const lead = m[0].length - m[0].trimStart().length, before = s[m.index + lead - 1] || '';
    if (/[A-Za-z]/.test(before) && !m[1] && !m[2]) continue;   /* "Q3", "FY26", "SOC2", "Severity-1" are not numbers */
    const dEnd = m.index + m[0].indexOf(m[4]) + m[4].length;
    if (/[A-Za-z]/.test(s[dEnd] || '') && !m[6] && !m[7] && !m[9] && /^\d+$/.test(m[4])) continue;
    const v = sfToNum(m[4], ctx.locale); if (v == null) continue;
    let unit = '', mult = 1, ccy = (m[2] || m[7] || '').toUpperCase().replace('US$', '$');
    ccy = ccy === '$' || ccy === 'USD' ? 'USD' : ccy === '€' || ccy === 'EUR' ? 'EUR' : ccy === '£' || ccy === 'GBP' ? 'GBP' : ccy === 'CHF' ? 'CHF' : '';
    const mw = sfFold(m[6] || '').replace(/\.$/, ''), u = sfFold(m[9] || '');
    if (mw) {
      if (mw === 'm' && !ccy && /^mo/.test(s.slice(SF_NUM_RE.lastIndex - 1, SF_NUM_RE.lastIndex + 2))) unit = 'months';
      else if (mw === 'mil') mult = /^(es|pt)$/.test(ctx.lang || _sfLangNow) || ctx.locale === 'eu' ? 1e3 : 1e6;   /* "500 mil" is 500 thousand in Spanish and Portuguese */
      else mult = SF_MULT[mw] || 1;
    }
    if (/^(%|percent|per cent|pct|pts|points|por ciento|prozent|per cento|por cento|procent)$/.test(u)) unit = '%';
    else if (u === 'bps') { unit = '%'; mult = 0.01; }
    else if (u === 'x' || u === '×') unit = 'x';
    else if (/^(months?|mos?\.?|mois|meses|mes|monaten?|monat|mesi|mese|maanden|maand|mnd)$/.test(u)) unit = 'months';
    else if (/^(days?|jours|dias|tagen?|giorni|dagen)$/.test(u)) unit = 'days';
    else if (/^(years?|yrs?|ans|anos|jahren?|anni|jaren|jaar)$/.test(u)) unit = 'years';
    if ((mw.length > 1 && mult >= 1e6) || ccy) unit = unit || '$';
    const neg = !!m[3] && (m[3] !== '(' || !!m[8]);
    let value = v * mult * (neg ? -1 : 1);
    const hi = m[5] != null ? sfToNum(m[5], ctx.locale) * mult : null;
    const approx = !!m[1], bound = !!m[1] && /over|under|up to|more than|less than|above|below|plus de|moins de|at least|at most|[<>≤≥]/i.test(m[1]);
    out.push({ value, unit, ccy, mult, approx, bound, range:hi != null ? [value, hi] : null, foot:!!m[10], raw:m[0].trim(), start:m.index, end:SF_NUM_RE.lastIndex, scaled:mult !== 1, unitWord:/[a-z]/i.test(m[9] || '') ? m[9] : '' });
  }
  return out;
}
function sfToNum(t, locale) {
  t = String(t).replace(/[  ' ]/g, ' ');
  if (/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(t)) t = t.replace(/ /g, '');
  const dots = (t.match(/\./g) || []).length, commas = (t.match(/,/g) || []).length;
  if (dots && commas) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (commas) t = commas > 1 || (locale !== 'eu' && /^\d{1,3}(,\d{3})+$/.test(t)) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (dots > 1 || (locale === 'eu' && /^\d{1,3}(\.\d{3})+$/.test(t))) t = t.replace(/\./g, '');
  const v = parseFloat(t); return isFinite(v) ? v : null;
}
