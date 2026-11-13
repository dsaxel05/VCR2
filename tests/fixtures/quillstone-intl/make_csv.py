"""Writes the localized ledger and monthly financials of the translated Quillstone data rooms from the English ones:
same numbers, headers and month names in each language (python tests/fixtures/quillstone-intl/make_csv.py)."""
import csv, pathlib
HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent / 'quillstone'
MONTHS = {   # month headers as a spreadsheet in that language would show them, October 2024 to September 2026
    'es': ['oct-24', 'nov-24', 'dic-24', 'ene-25', 'feb-25', 'mar-25', 'abr-25', 'may-25', 'jun-25', 'jul-25', 'ago-25', 'sep-25', 'oct-25', 'nov-25', 'dic-25', 'ene-26', 'feb-26', 'mar-26', 'abr-26', 'may-26', 'jun-26', 'jul-26', 'ago-26', 'sep-26'],
    'de': ['Okt 24', 'Nov 24', 'Dez 24', 'Jan 25', 'Feb 25', 'Mär 25', 'Apr 25', 'Mai 25', 'Jun 25', 'Jul 25', 'Aug 25', 'Sep 25', 'Okt 25', 'Nov 25', 'Dez 25', 'Jan 26', 'Feb 26', 'Mär 26', 'Apr 26', 'Mai 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26'],
    'it': ['ott-24', 'nov-24', 'dic-24', 'gen-25', 'feb-25', 'mar-25', 'apr-25', 'mag-25', 'giu-25', 'lug-25', 'ago-25', 'set-25', 'ott-25', 'nov-25', 'dic-25', 'gen-26', 'feb-26', 'mar-26', 'apr-26', 'mag-26', 'giu-26', 'lug-26', 'ago-26', 'set-26'],
    'pt': ['out/24', 'nov/24', 'dez/24', 'jan/25', 'fev/25', 'mar/25', 'abr/25', 'mai/25', 'jun/25', 'jul/25', 'ago/25', 'set/25', 'out/25', 'nov/25', 'dez/25', 'jan/26', 'fev/26', 'mar/26', 'abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26'],
    'nl': ['okt-24', 'nov-24', 'dec-24', 'jan-25', 'feb-25', 'mrt-25', 'apr-25', 'mei-25', 'jun-25', 'jul-25', 'aug-25', 'sep-25', 'okt-25', 'nov-25', 'dec-25', 'jan-26', 'feb-26', 'mrt-26', 'apr-26', 'mei-26', 'jun-26', 'jul-26', 'aug-26', 'sep-26'],
    'fr': ['oct. 24', 'nov. 24', 'déc. 24', 'janv. 25', 'févr. 25', 'mars 25', 'avr. 25', 'mai 25', 'juin 25', 'juil. 25', 'août 25', 'sept. 25', 'oct. 25', 'nov. 25', 'déc. 25', 'janv. 26', 'févr. 26', 'mars 26', 'avr. 26', 'mai 26', 'juin 26', 'juil. 26', 'août 26', 'sept. 26'],
}
NAMES = {   # file names, customer column, financials headers (month, revenue, cash, burn, expenses, headcount)
    'es': ('04-registro-clientes.csv', '05-financieros-mensuales.csv', 'Cliente', ['Mes', 'Ingresos', 'Caja', 'Consumo de caja', 'Gastos totales', 'Empleados']),
    'de': ('04-kundenumsatz.csv', '05-monatszahlen.csv', 'Kunde', ['Monat', 'Umsatz', 'Liquide Mittel', 'Cash Burn', 'Gesamtkosten', 'Mitarbeiter']),
    'it': ('04-registro-clienti.csv', '05-dati-mensili.csv', 'Cliente', ['Mese', 'Ricavi', 'Cassa', 'Consumo di cassa', 'Costi totali', 'Dipendenti']),
    'pt': ('04-receita-por-cliente.csv', '05-financeiro-mensal.csv', 'Cliente', ['Mês', 'Receita', 'Caixa', 'Queima de caixa', 'Despesas totais', 'Funcionários']),
    'nl': ('04-omzet-per-klant.csv', '05-maandcijfers.csv', 'Klant', ['Maand', 'Omzet', 'Kas', 'Burn', 'Totale kosten', 'Medewerkers']),
    'fr': ('04-registre-clients.csv', '05-financiers-mensuels.csv', 'Client', ['Mois', "Chiffre d'affaires", 'Trésorerie', 'Consommation de trésorerie', 'Charges totales', 'Effectif']),
}
ledger = list(csv.reader(open(SRC / '04-customer-ledger.csv', encoding='utf-8')))
series = list(csv.reader(open(SRC / '05-monthly-financials.csv', encoding='utf-8')))
for lang, (lf, sf, cust, heads) in NAMES.items():
    d = HERE / lang
    with open(d / lf, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';' if lang in ('de', 'fr', 'nl') else ','); w.writerow([cust] + MONTHS[lang]); w.writerows(ledger[1:])
    with open(d / sf, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';' if lang in ('de', 'fr', 'nl') else ','); w.writerow(heads)
        for i, r in enumerate(series[1:]): w.writerow([MONTHS[lang][i]] + r[1:])
print('written')
