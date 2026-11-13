/* ═══════════════════════════════════════════════════════════════
   SMART FILL: LANGUAGES. The words Smart fill needs in each language
   it reads: English and French, plus Spanish, German, Italian,
   Portuguese and Dutch. Plain lists, so a word is added here without
   touching the rules that use it. Rules match accent-folded lower
   case text unless a list says otherwise.
   ═══════════════════════════════════════════════════════════════ */
const sfFold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* month number: names and abbreviations in the seven languages (folded) */
const SF_MONTHS_SRC = `1 january jan janvier janv enero ene januar gennaio gen janeiro januari
2 february feb fevrier fevr fev febrero februar febbraio fevereiro februari
3 march mar mars marzo marz mrz marco maart mrt
4 april apr avril avr abril abr aprile
5 may mai mayo maggio mag maio mei
6 june jun juin junio juni giugno giu junho
7 july jul juillet juil julio juli luglio lug julho
8 august aug aout agosto ago augustus
9 september sep sept septembre septiembre setiembre settembre set setembro
10 october oct octobre octubre oktober okt ottobre ott outubro out
11 november nov novembre noviembre novembro
12 december dec decembre diciembre dic dezember dez dicembre dezembro`;
const SF_MON = {};
SF_MONTHS_SRC.split('\n').forEach(l => { const [n, ...w] = l.trim().split(/\s+/); w.forEach(x => { SF_MON[x] = +n; }); });
/* short forms that are also ordinary words ("ago", "set", "out"): a month only when a year or a day number is next to them */
const SF_MON_SHY = 'ene|abr|ago|dic|gen|mag|giu|lug|set|ott|out|dez|okt|mrz|mrt|mei|marz|marco';
const SF_MON_ALL = Object.keys(SF_MON).sort((a, b) => b.length - a.length).join('|');
const SF_MON_RX = new RegExp('^(' + SF_MON_ALL + ')\\.?[- \'/]?(\\d{2}|\\d{4})$');   /* a month header: "Sep-26", "sept. 2026", "dic 25" */
if (typeof MON !== 'undefined') SF_MONTHS_SRC.split('\n').forEach(l => { const [n, ...w] = l.trim().split(/\s+/); w.forEach(x => { if (!(x in MON)) MON[x] = +n; }); });

/* words, one list per use; "|" separates entries (regular-expression alternatives, written for folded text) */
const SF_L = {
  /* a value that is not an actual: forecast, plan, target, someone else's figure */
  notActual:'prevision|previsto|pronostico|presupuesto|proyeccion|proyectado|objetivo|objetivos|estimado|estimacion|esperado|prognose|planung|geplant|ziel|zielwert|erwartet|schatzung|hochrechnung|previsione|preventivo|obiettivo|stima|proiezione|atteso|previsao|orcamento|projecao|projetado|estimativa|begroting|doel|doelstelling|verwachting|verwacht|raming|competidor|competidores|competencia|wettbewerber|konkurrenz|konkurrent|concorrente|concorrenti|concorrencia|concurrent|concurrenten|concurrentie|mercado|markt|mercato|sector|branche|settore|setor|industria|industrie|escenario|szenario|cenario|supuesto|supuestos|annahme|annahmen|ipotesi|hipotese|hipoteses|aanname|aannames|hypothese|hypotheses|ano que viene|proximo ano|nachstes jahr|prossimo anno|volgend jaar|annee prochaine',
  /* a column or line that is an actual */
  actual:'real|reales|tatsachlich|effettivo|consuntivo|realizzato|realizado|efetivo|werkelijk|gerealiseerd|realise|cierre|chiusura|fechamento|ultimos 12 meses|letzte 12 monate|letzten 12 monate|ultimi 12 mesi|laatste 12 maanden|12 derniers mois|a la fecha|al \\d|am \\d|zum \\d|alla data|em \\d|per \\d|op \\d',
  /* the year before */
  prior:'ano anterior|ano pasado|hace un ano|hace 12 meses|vorjahr|vor einem jahr|vor 12 monaten|anno precedente|anno scorso|un anno fa|12 mesi fa|ano passado|ha um ano|ha 12 meses|vorig jaar|een jaar geleden|12 maanden geleden|annee precedente|l an dernier|annee derniere|il y a un an|il y a 12 mois|n-1',
  /* headings whose numbers explain a figure rather than state it */
  defs:'definiciones|notas|anexo|apendice|glosario|metodologia|supuestos|hipotesis|definitionen|fussnoten|anhang|glossar|methodik|annahmen|definizioni|appendice|glossario|ipotesi|definicoes|apendice|premissas|definities|voetnoten|bijlage|woordenlijst|aannames|definitions|annexe|glossaire|methodologie|hypotheses|notes de bas de page',
  /* the start of a letter (never a label) */
  greet:'hola|estimad[oa]s?|querid[oa]s?|hallo|liebe|lieber|sehr geehrte|ciao|gentili|cari|care|ola|caros|caras|prezad[oa]s|beste|geachte|chers|cheres|madame|monsieur',
  /* "and", "but", "while" that end the words naming a number */
  conj:'y|pero|mientras|und|aber|während|e|ma|mentre|mas|enquanto|maar|terwijl|tandis que',
  /* "grew by", "up" before a percentage */
  up:'crecio|crecimos|crecimiento de|aumento de|aumentamos|subio|wuchs|gewachsen|gestiegen|wachstum von|plus|crescita del|cresciuto|cresciuti|aumentato|crescimento de|cresceu|crescemos|aumentou|gegroeid|groei van|steeg|gestegen|hausse de|en hausse de|progression de|a augmente de',
  /* "year on year" after a percentage */
  yoy:'interanual|a/a|ano contra ano|respecto al ano anterior|ggu\\.? vorjahr|gegenuber dem vorjahr|im vergleich zum vorjahr|zum vorjahr|anno su anno|su base annua|rispetto all anno precedente|ano contra ano|em relacao ao ano anterior|jaar op jaar|ten opzichte van vorig jaar|sur un an|par rapport a l an dernier|en glissement annuel',
  /* a one-month figure */
  oneMonth:'este mes|al mes|por mes|mensual|diesen monat|pro monat|monatlich|questo mese|al mese|mensile|este mes|por mes|mensal|deze maand|per maand|maandelijks|ce mois|par mois|mensuel',
  /* "in thousands" and "in millions" near a table */
  thousands:'en miles|miles de|in tausend|tsd\\.?\\s?(?:eur|€|usd|\\$)|in tsd|in migliaia|migliaia di|em milhares|milhares de|in duizenden|x\\s?1[.,]?000\\b|k€|€k|keur',
  millions:'en millones|millones de|in mio|in millionen|millionen eur|mio\\.?\\s?(?:eur|€|usd|\\$)|in milioni|milioni di|em milhoes|milhoes de|in miljoenen|miljoen euro|m€|€m|meur|en millions',
};
/* a date without a year is not a figure: "30 de junio", "30. Juni", "30 giugno", "1er août", "30 June" */
const SF_DAY_MONTH = new RegExp('\\b\\d{1,2}(?:er|\\.)?\\s(?:de\\s)?(?:' + Object.keys(SF_MON).filter(k => k.length > 3 || /^(may|mai|mei)$/.test(k)).concat(['août', 'février', 'décembre', 'märz', 'março', 'fév', 'déc', 'mär']).join('|') + ')\\b\\.?', 'gi');
/* a cell that is one figure with a scale or unit word of another language: "13,4 mln $", "US$ 0,90 mi", "15,6 Mio. $", "9 meses" */
const SF_NUM_CELL = /^(?:us\$|r\$|usd|eur|chf|gbp)?[^a-z]*\d[^a-z]*(mln|mld|mio|mrd|mia|mi|bi|tsd|mil|mila|millones|millon|mill|milioni|milione|miliardi|milhoes|milhao|bilhoes|bilhao|miljoen|miljoenen|miljard|millionen|milliarden|tausend|duizend|meses|mes|mesi|mese|monate|monaten|maanden|maand|mois|dias|giorni|tage|tagen|dagen|jours|anos|anni|jahre|jaar)\.?[^a-z]*$/;
const _sfLRe = {}, sfLRe =k => _sfLRe[k] || (_sfLRe[k] = new RegExp('\\b(' + SF_L[k] + ')\\b', 'i'));   /* built once per list */
const sfLRaw = k => _sfLRe['~' + k] || (_sfLRe['~' + k] = new RegExp(SF_L[k], 'i'));

/* the language of a document, from its most common short words: decides the few words that differ between languages
   ("mil" is a thousand in Spanish and Portuguese, a million in English) */
const SF_LANG_WORDS = { en:'the and of to our with we is for are this', fr:'le les des et nous est pour avec du une au aux sur', es:'el los las y nuestro nuestra por como al esta pero', de:'der die das und wir ist mit fur von den ein im auf', it:'il gli della che nostro sono nel alla degli dei questo', pt:'os do da dos com nosso nossa nao ao pelo pela', nl:'het een van wij met voor onze zijn ook niet bij' };
function sfLang(text) {
  const w = sfFold(String(text || '').slice(0, 20000)).split(/[^a-z]+/), n = {};
  const sets = Object.entries(SF_LANG_WORDS).map(([k, v]) => [k, new Set(v.split(' '))]);
  for (const x of w) for (const [k, s] of sets) if (s.has(x)) n[k] = (n[k] || 0) + 1;
  const [a, b] = Object.keys(n).sort((x, y) => n[y] - n[x]);   /* clear only with 5 words or more and twice the runner-up; else English */
  return a && n[a] >= 5 && n[a] >= 2 * (n[b] || 0) ? a : 'en';
}

/* document types: file-name words and keywords in the other languages (raw text, accents kept) */
const SF_TYPES_INTL = {
  deck:[/presentaci|präsentation|praesentation|presentazione|apresenta|presentatie/i, /tracción|el problema|nuestra solución|estamos levantando|das problem|unsere lösung|wir sammeln|trazione|il problema|la nostra soluzione|tração|o problema|nossa solução|estamos captando|tractie|het probleem|onze oplossing|notre solution|le problème|nous levons/i],
  update:[/actualizaci|aggiornamento|atualiza|bericht|nieuwsbrief|lettre|carta/i, /hola a todos|estimados inversores|queridos inversores|liebe investoren|hallo zusammen|ciao a tutti|cari investitori|olá a todos|caros investidores|beste investeerders|hallo allemaal|chers investisseurs|este mes|diesen monat|questo mese|deze maand|ce mois-ci/i],
  model:[/modelo|modell|modello|financiero|finanz|finanziario|financeiro|financieel|prévisionnel/i, /margen bruto|arr de apertura|arr de cierre|cuenta de resultados|bruttomarge|gewinn- und verlustrechnung|guv|margine lordo|conto economico|margem bruta|demonstração de resultados|brutomarge|winst- en verliesrekening|compte de résultat|marge brute/i],
  captable:[/tabla de capitalizaci|beteiligungs|tabella di capitalizzazione|tabela de capitaliza|aandeelhoudersregister/i, /totalmente diluido|voll verwässert|completamente diluito|totalmente diluído|volledig verwaterd/i],
  termsheet:[/hoja de t|condiciones|beteiligungsvertrag|eckpunkte|termini|termos|voorwaarden/i, /preferencia de liquidación|liquidationspräferenz|preferenza di liquidazione|preferência de liquidação|liquidatiepreferentie|préférence de liquidation/i],
  bank:[/banco|banca|extracto|kontoauszug|estratto|extrato|afschrift|relev/i, /saldo final|saldo inicial|endsaldo|anfangssaldo|saldo finale|saldo iniziale|eindsaldo|beginsaldo|solde final|solde initial/i],
  security:[/seguridad|sicherheit|sicurezza|segurança|beveiliging|sécurité|cumplimiento|legal/i, /disponibilidad|verfügbarkeit|disponibilità|disponibilidade|beschikbaarheid|litigio|rechtsstreit|contenzioso|litígio|rechtszaak/i],
  headcount:[/plantilla|personal|mitarbeiter|personale|pessoal|personeel|effectifs/i, /empleados|mitarbeiter|dipendenti|funcionários|medewerkers|effectif/i],
};

/* labels in the other languages, and English wordings the built-in table lacked.
   id | synonyms ; ... | veto terms ; ... | words one of which must appear (added to the field's own) */
const SF_DICT_INTL = `arr_now|annualised recurring revenue;arr al cierre;arr de cierre;arr final;arr am periodenende;arr zum stichtag;arr am monatsende;arr di fine periodo;arr finale;arr de fechamento;arr no fechamento;arr eind;arr aan het einde;arr de clôture;arr en fin de période;ingresos recurrentes anuales;ingresos recurrentes anualizados;arr actual;facturación recurrente anual;jährlich wiederkehrender umsatz;jährlich wiederkehrende umsätze;wiederkehrender jahresumsatz;ricavi ricorrenti annuali;ricavi ricorrenti annui;fatturato ricorrente annuo;receita recorrente anual;receita anual recorrente;jaarlijks terugkerende omzet;jaarlijkse terugkerende omzet;chiffre d affaires annuel récurrent;revenus récurrents annuels|por empleado;pro mitarbeiter;per dipendente;por funcionario;per medewerker;objetivo;ziel;obiettivo;meta;doel;hace 12 meses;vor 12 monaten;12 mesi fa;ha 12 meses;12 maanden geleden;año anterior;vorjahr;anno precedente;ano anterior;vorig jaar;nuevos clientes;neukunden;nuovi clienti;novos clientes;nieuwe klanten;expansión;espansione;expansão;uitbreiding;bajas;abwanderung;apertura;eröffnung;inicio;il y a un an
arr_12mo|arr hace 12 meses;arr del año anterior;arr de apertura;arr inicial;arr vor 12 monaten;arr im vorjahr;arr vorjahr;arr 12 mesi fa;arr anno precedente;arr ha 12 meses;arr do ano anterior;arr 12 maanden geleden;arr vorig jaar;arr il y a un an;arr d ouverture
new_arr_l12|arr de nuevos clientes;nuevo arr;arr nuevos logos;neukunden arr;arr aus neukunden;arr nuovi clienti;nuovo arr;arr de novos clientes;novo arr;arr nieuwe klanten;nieuwe arr;arr nouveaux clients
expansion_arr_l12|expansión;arr de expansión;erweiterungsumsatz;expansion arr;espansione;arr di espansione;expansão;arr de expansão;uitbreiding;expansie arr
churned_arr_l12|arr perdido;arr cancelado;verlorener arr;gekündigter arr;arr perso;arr perdida;cancelamentos;verloren arr;opgezegde arr|clientes;kunden;clienti;klanten;tasa;quote;tasso;taxa
contraction_arr_l12|contracción;reducción de arr;kontraktion;herabstufungen;contrazione;contração;redução de arr;contractie;krimp
gross_margin|margen bruto;margen bruto %;bruttomarge;rohertragsmarge;rohmarge;margine lordo;margem bruta;brutomarge;bruto marge|objetivo;ziel;obiettivo;meta;doel;hace 12 meses;vorjahr;12 mesi fa;ha 12 meses;vorig jaar
cogs_hosting|alojamiento;costes de alojamiento;costos de infraestructura;hosting kosten;infrastrukturkosten;costi di hosting;costi di infrastruttura;custos de hospedagem;custos de infraestrutura;hostingkosten;infrastructuurkosten|ingresos;umsatz;ricavi;receita;omzet
cogs_support|costes de soporte;costos de soporte;supportkosten;kundensupport kosten;costi di supporto;custos de suporte;klantenservice kosten|ingresos;umsatz;ricavi;receita;omzet
services_pct|porcentaje de servicios;ingresos por servicios %;dienstleistungsanteil;anteil dienstleistungen;quota servizi;percentuale servizi;participação de serviços;aandeel diensten
pct_annual|annual or multi-year;annual or multi year;multi-year contracts;annual or multi-year contracts;contracts annual or longer;contratos anuales;contratos anuales o plurianuales;jahresverträge;anteil jahresverträge;contratti annuali;contratti annuali o pluriennali;contratos anuais;contratos anuais ou plurianuais;jaarcontracten;contrats annuels ou pluriannuels
deferred_revenue|ingresos diferidos;ingresos anticipados;passive rechnungsabgrenzung;rechnungsabgrenzungsposten;risconti passivi;ricavi differiti;receita diferida;receitas diferidas;vooruitgefactureerde omzet;uitgestelde omzet
ar_over_90|más de 90 días;cuentas por cobrar a más de 90 días;über 90 tage;forderungen über 90 tage;oltre 90 giorni;crediti oltre 90 giorni;acima de 90 dias;contas a receber acima de 90 dias;ouder dan 90 dagen;debiteuren ouder dan 90 dagen
cash_on_hand|caja;tesorería;efectivo;efectivo y equivalentes;saldo de caja;saldo bancario;posición de caja;kasse;liquide mittel;liquiden mittel;liquiden mitteln;flüssige mittel;liquidität;bankguthaben;barmittel;kassenbestand;cassa;liquidità;disponibilità liquide;saldo di cassa;caixa;saldo de caixa;disponibilidades;caixa e equivalentes;kas;liquide middelen;banksaldo;kassaldo;geldmiddelen;position de trésorerie|consumo;quema;flujo;restringido;verbrauch;abfluss;mittelabfluss;consumo;flusso;queima;fluxo;verbranding;kasstroom;por mes;pro monat;al mese;por mês;per maand;inicial;anfangsbestand;iniziale;begin;mensual;monatlich;mensile;mensal;maandelijks
net_burn|consumo neto de caja;quema neta;burn neto;consumo de caja mensual;consumo mensual de caja;quema mensual;netto burn;nettomittelabfluss;monatlicher cash burn;monatlicher burn;monatlicher mittelabfluss;consumo netto di cassa;burn netto;consumo di cassa mensile;burn mensile;queima líquida;consumo líquido de caixa;queima de caixa;queima mensal;netto kasverbranding;maandelijkse burn;consommation mensuelle de trésorerie|bruto;brutto;lordo;bruta;múltiplo;multiplo;objetivo;ziel;obiettivo;meta;doel
gross_burn|consumo bruto;burn bruto;gastos totales mensuales;brutto burn;monatliche gesamtausgaben;burn lordo;costi totali mensili;queima bruta;despesas mensais totais;bruto burn;totale maandelijkse kosten|neto;netto;líquida;liquida;múltiplo;multiplo
total_raised|total captado;capital captado;financiación total;total levantado;fondos levantados;gesamtfinanzierung;eingeworbenes kapital;bisher eingeworbenes kapital;totale raccolto;capitale raccolto;raccolta totale;total captado até hoje;capital levantado;totaal opgehaald;opgehaald kapitaal;totaal opgehaald kapitaal
pre_money|valoración pre-money de la última ronda;pre-money letzte runde;pre-money der letzten runde;pre-money ultimo round;pre-money da última rodada;pre-money laatste ronde|||última ronda;ronda anterior;letzte runde;letzten runde;vorherige runde;ultimo round;round precedente;última rodada;rodada anterior;laatste ronde;vorige ronde
notes_principal|importe principal;nennbetrag;darlehensbetrag;capitale;valor principal;hoofdsom|||nota convertible;notas convertibles;wandeldarlehen;wandelanleihe;prestito convertibile;nota conversível;mútuo conversível;converteerbare lening;obligations convertibles
debt_outstanding|deuda;deuda pendiente;deuda venture;préstamo;fremdkapital;darlehen;bankdarlehen;debito;debito residuo;finanziamento bancario;dívida;empréstimo;schuld;lening;openstaande schuld;dette financière
months_since_round|meses desde la última ronda;monate seit der letzten runde;mesi dall ultimo round;meses desde a última rodada;maanden sinds laatste ronde
customers_now|clientes;número de clientes;clientes activos;clientes de pago;kunden;anzahl kunden;anzahl der kunden;aktive kunden;zahlende kunden;kundenanzahl;clienti;numero di clienti;clienti attivi;clienti paganti;número de clientes;clientes ativos;clientes pagantes;klanten;aantal klanten;actieve klanten;betalende klanten|nuevos;neue;neukunden;nuovi;novos;nieuwe;perdidos;verlorene;persi;verloren;hace 12 meses;vor 12 monaten;12 mesi fa;ha 12 meses;12 maanden geleden;por cliente;pro kunde;per cliente;per klant;objetivo;ziel;obiettivo;meta;doel;satisfacción;zufriedenheit;soddisfazione;satisfação;tevredenheid;principales;größte;größten;principali;maiores;grootste;adquisición;akquisition;acquisizione;aquisição;acquisitie;mayor;primo;maior;año anterior;vorjahr;anno precedente;ano anterior;vorig jaar
customers_12mo|clientes hace 12 meses;clientes del año anterior;kunden vor 12 monaten;kunden im vorjahr;clienti 12 mesi fa;clienti anno precedente;clientes há 12 meses;clientes do ano anterior;klanten 12 maanden geleden;klanten vorig jaar;clients il y a un an
logos_lost_l12|clientes perdidos;bajas de clientes;verlorene kunden;kundenabgänge;gekündigte kunden;clienti persi;clientes cancelados;verloren klanten;opgezegde klanten|tasa;quote;tasso;taxa
top1_pct|principal cliente;mayor cliente;cliente más grande;größter kunde;anteil größter kunde;primo cliente;cliente principale;maior cliente;grootste klant
top5_pct|5 principales clientes;cinco mayores clientes;top 5 clientes;top 5 kunden;5 größte kunden;fünf größte kunden;primi 5 clienti;top 5 clienti;5 maiores clientes;top 5 klanten;5 grootste klanten
top10_pct|10 principales clientes;top 10 clientes;top 10 kunden;10 größte kunden;primi 10 clienti;top 10 clienti;10 maiores clientes;top 10 klanten;10 grootste klanten
sm_spend_l12|ventas y marketing;gasto en ventas y marketing;gastos comerciales y de marketing;vertrieb und marketing;vertriebs und marketingkosten;vendite e marketing;spese commerciali e marketing;costi di vendita e marketing;vendas e marketing;despesas de vendas e marketing;verkoop en marketing;verkoop en marketingkosten|plantilla;mitarbeiter;personale;equipe;trimestre;quartal;kwartaal
new_customers_l12|clientes nuevos;clientes ganados;nuevos clientes;neukunden;neue kunden;gewonnene kunden;nuovi clienti;clienti acquisiti;novos clientes;clientes conquistados;nieuwe klanten;gewonnen klanten|perdidos;verlorene;persi;verloren
win_rate|tasa de cierre;tasa de éxito;abschlussquote;gewinnrate;tasso di chiusura;tasso di successo;taxa de conversão;taxa de fechamento;winratio;conversiepercentage|contra;gegen;contro;tegen
sales_cycle|ciclo de ventas;ciclo de venta;vertriebszyklus;verkaufszyklus;ciclo di vendita;ciclo de vendas;verkoopcyclus;salescyclus
pipeline_coverage|cobertura del pipeline;cobertura de pipeline;pipeline abdeckung;copertura della pipeline;cobertura do pipeline;pipelinedekking
quota_attainment|cumplimiento de cuota;quotenerreichung;raggiungimento quota;atingimento de cota;quotarealisatie
pct_paid|adquisición pagada;bezahlte akquisition;acquisizione a pagamento;aquisição paga;betaalde acquisitie
headcount_now|empleados;plantilla;número de empleados;personas;mitarbeiter;anzahl mitarbeiter;beschäftigte;belegschaft;dipendenti;numero di dipendenti;organico;personale;funcionários;colaboradores;número de funcionários;medewerkers;aantal medewerkers;werknemers;personeel;fte|ingeniería;entwicklung;ingegneria;engenharia;ontwikkeling;ventas;vertrieb;vendite;vendas;verkoop;hace 12 meses;vor 12 monaten;12 mesi fa;ha 12 meses;12 maanden geleden;coste;kosten;costo;custo;por empleado;pro mitarbeiter;per dipendente;por funcionario;per medewerker;vacantes;offene stellen;posizioni aperte;vagas;vacatures;año anterior;vorjahr;anno precedente;ano anterior;vorig jaar
headcount_12mo|empleados hace 12 meses;plantilla del año anterior;mitarbeiter vor 12 monaten;mitarbeiter im vorjahr;dipendenti 12 mesi fa;funcionários há 12 meses;medewerkers 12 maanden geleden;effectif il y a un an
headcount_eng|ingeniería;ingenieros;desarrolladores;entwickler;softwareentwickler;ingegneria;ingegneri;sviluppatori;engenharia;engenheiros;desenvolvedores;ontwikkelaars|salidas;abgänge;uscite;saídas;vertrokken
headcount_sales|equipo de ventas;comerciales;vendedores;vertriebsmitarbeiter;vertriebsteam;venditori;team commerciale;forza vendita;equipe comercial;verkopers;salesteam|gasto;kosten;spese;despesas;uitgaven;ciclo;zyklus;cyclus
avg_loaded_comp|coste medio por empleado;costo medio por empleado;durchschnittliche personalkosten pro mitarbeiter;costo medio per dipendente;custo médio por funcionário;gemiddelde loonkosten per medewerker
founders_count|fundadores;número de fundadores;gründer;anzahl gründer;fondatori;oprichters
founder_max_equity|participación del fundador;gründeranteil;quota del fondatore;participação do fundador;aandeel oprichter
eng_departures_l12|salidas de ingenieros;abgänge entwickler;uscite ingegneri;saídas de engenheiros;vertrokken ontwikkelaars
target_accounts|cuentas objetivo;zielkunden;account target;contas-alvo;doelaccounts
reachable_pct|alcanzables;erreichbar;raggiungibili;alcançáveis;bereikbaar
primary_competitor|competidor principal;hauptwettbewerber;concorrente principale;principal concorrente;belangrijkste concurrent
win_rate_vs_primary|tasa de victoria contra;gewinnrate gegen;tasso di vittoria contro;taxa de vitória contra;winratio tegen|||contra;gegen;contro;tegen
patents|patentes;patente;brevetti;octrooien
pmf_very_disappointed|muy decepcionados;sehr enttäuscht;molto delusi;muito decepcionados;zeer teleurgesteld
pmf_respondents|encuestados;befragte;rispondenti;respondentes;respondenten
why_now|por qué ahora;warum jetzt;perché ora;por que agora;waarom nu
seat_util|uso de licencias;lizenznutzung;utilizzo delle licenze;utilização de licenças;licentiegebruik
usage_based_pct|ingresos por uso;nutzungsbasierter umsatz;ricavi a consumo;receita baseada em uso;gebruiksgebaseerde omzet
gm_12mo|margen bruto hace 12 meses;bruttomarge vorjahr;margine lordo 12 mesi fa;margem bruta há 12 meses;brutomarge vorig jaar
gmv_now|volumen bruto de mercancías;bruttowarenvolumen;handelsvolumen;volume lordo delle merci;volume bruto de mercadorias;bruto handelsvolume
contrib_margin|margen de contribución;deckungsbeitrag;margine di contribuzione;margem de contribuição;contributiemarge
loss_rate|tasa de pérdidas;ausfallquote;verlustquote;tasso di perdita;taxa de perdas;verliespercentage
volume_now|volumen procesado;transaktionsvolumen;volume transato;volume processado;transactievolume
option_pool|pool de opciones no asignado;nicht zugeteilter optionspool;pool di opzioni non assegnato;pool de opções não alocado;niet toegekende optiepool
litigation|litigio;litigios;demanda judicial;rechtsstreit;klage;rechtsstreitigkeiten;contenzioso;litígio;processo judicial;rechtszaak;geschil
uptime_90d|disponibilidad;verfügbarkeit;disponibilità;disponibilidade;beschikbaarheid
p1_incidents|incidentes críticos;kritische vorfälle;incidenti critici;kritieke incidenten
dpas_signed|acuerdos de tratamiento de datos;auftragsverarbeitungsverträge;accordi sul trattamento dei dati;acordos de tratamento de dados;verwerkersovereenkomsten
insurance_dno|seguro d&o;d&o versicherung;assicurazione d&o;d&o verzekering
founder_vesting|vesting de fundadores;gründer vesting;vesting dei fondatori;vesting dos fundadores;vesting oprichters
stated_growth|interanual;año contra año;ggü vorjahr;ggü. vorjahr;gegenüber vorjahr;vs vorjahr;yoy wachstum;anno su anno;su base annua;ano contra ano;jaar op jaar;sur un an;en glissement annuel;crecimiento;crecimiento anual;crecimiento interanual;crecimiento del arr;wachstum;jahreswachstum;arr wachstum;umsatzwachstum;crescita;crescita annua;crescita anno su anno;crescita arr;crescimento;crescimento anual;crescimento do arr;groei;jaarlijkse groei;jaar op jaar groei;arr groei;croissance de l arr|mercado;markt;mercato;objetivo;ziel;obiettivo;meta;doel;plantilla;mitarbeiter;personale;equipe;competidor;wettbewerber;concorrente;concurrent
stated_runway|meses de runway;meses de caja;pista de caja;reichweite;liquiditätsreichweite;cash reichweite;mesi di runway;autonomia finanziaria;autonomia di cassa;meses de caixa;maanden runway;kaspositie in maanden|objetivo;ziel;obiettivo;meta;doel
stated_nrr|retención neta de ingresos;retención neta;nettoumsatzbindung;netto umsatzretention;net dollar retention;ritenzione netta dei ricavi;retenzione netta;retenção líquida de receita;retenção líquida;netto omzetretentie;netto retentie|bruta;brutto;lorda;bruto;objetivo;ziel;obiettivo;meta;doel
stated_grr|retención bruta de ingresos;retención bruta;bruttoumsatzbindung;brutto umsatzretention;ritenzione lorda;retenzione lorda;retenção bruta;bruto omzetretentie;bruto retentie|neta;netto;líquida;liquida
stated_burn_multiple|múltiplo de quema;multiplo di burn;múltiplo de queima
stated_cac|coste de adquisición de clientes;costo de adquisición de clientes;costo de adquisición;kundenakquisitionskosten;akquisitionskosten;costo di acquisizione cliente;custo de aquisição de clientes;klantacquisitiekosten|recuperación;amortisation;rientro;retorno;terugverdientijd
stated_cac_payback|periodo de recuperación del cac;recuperación del cac;payback del cac;cac amortisation;amortisationsdauer;cac payback;periodo di rientro del cac;payback do cac;período de retorno do cac;cac terugverdientijd;terugverdientijd;délai de récupération du cac
stated_acv|valor medio de contrato;valor promedio del contrato;durchschnittlicher vertragswert;valore medio del contratto;valor médio do contrato;gemiddelde contractwaarde
stated_tam|mercado total direccionable;mercado direccionable;adressierbarer markt;gesamtmarkt;mercato indirizzabile;mercato totale indirizzabile;mercado endereçável;mercado total endereçável;totale adresseerbare markt;adresseerbare markt|crecimiento;wachstum;crescita;crescimento;groei
stated_take_rate|tasa de comisión;provisionssatz;kommissionsrate;tasso di commissione;taxa de comissão;commissiepercentage
round_size|tamaño de la ronda;ronda de financiación;ronda de inversión;estamos levantando;levantamos;importe de la inversión;finanzierungsrunde;rundengröße;wir sammeln;investitionssumme;dimensione del round;round di investimento;stiamo raccogliendo;importo dell investimento;tamanho da rodada;rodada de investimento;estamos captando;valor do investimento;financieringsronde;rondegrootte;we halen op;investeringsbedrag;montant du tour;una ronda de;preparando una ronda;eine finanzierungsrunde über;finanzierungsrunde über;un round di;preparando un round;uma rodada de;preparando uma rodada;een ronde van;une levée de;préparons une levée|objetivo;ziel;obiettivo;meta;doel;última ronda;letzte runde;ultimo round;última rodada;laatste ronde
round_pre_money|valoración pre-money;valoración pre money;pre-money bewertung;pre money bewertung;bewertung pre-money;valutazione pre-money;valutazione pre money;avaliação pre-money;valuation pré-money;valuation pre-money;pre-money waardering;waardering pre-money|última ronda;ronda anterior;letzte runde;vorherige runde;ultimo round;round precedente;última rodada;rodada anterior;laatste ronde;vorige ronde
new_liq_pref|preferencia de liquidación;liquidationspräferenz;preferenza di liquidazione;preferência de liquidação;liquidatiepreferentie
new_participating|participativa;participativo;partizipierend;partecipante;participerend
anti_dilution|antidilución;verwässerungsschutz;anti diluizione;antidiluizione;antidiluição;antiverwatering
board_after|consejo de administración;aufsichtsrat;beirat;consiglio di amministrazione;conselho de administração;raad van bestuur;raad van commissarissen
pro_rata_rights|derechos de pro rata;derecho de suscripción preferente;bezugsrecht;pro rata recht;diritto di prelazione;direito de preferência;voorkeursrecht
information_rights|derechos de información;informationsrechte;diritti di informazione;direitos de informação;informatierechten
cumulative_dividends|dividendos;dividenden;dividendi;dividend
redemption_rights|derecho de rescate;rückkaufsrecht;diritto di riscatto;direito de resgate;terugkooprecht
liq_pref||||existente;bestehende;esistente;bestaande;existante
safe_cap|tope de valoración;valoración máxima;bewertungsobergrenze;tetto di valutazione;teto de valuation;limite de valuation;waarderingsplafond
safe_discount|descuento;abschlag;sconto;desconto;korting
notes_rate|tipo de interés;interés;zinssatz;zins;tasso di interesse;taxa de juros;juros;rente;rentevoet|||nota convertible;notas convertibles;wandeldarlehen;wandelanleihe;prestito convertibile;nota conversível;mútuo conversível;converteerbare lening;obligations convertibles
notes_cap|tope de valoración;bewertungsobergrenze;tetto di valutazione;teto de valuation;waarderingsplafond|||nota convertible;notas convertibles;wandeldarlehen;wandelanleihe;prestito convertibile;nota conversível;mútuo conversível;converteerbare lening;obligations convertibles
notes_discount|descuento;abschlag;sconto;desconto;korting|||nota convertible;notas convertibles;wandeldarlehen;wandelanleihe;prestito convertibile;nota conversível;mútuo conversível;converteerbare lening;obligations convertibles
pool_target_post|pool de opciones;optionspool;pool di opzioni;pool de opções;optiepool`;
