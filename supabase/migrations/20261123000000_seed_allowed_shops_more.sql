-- Seed: 30 more trusted Polish shops for the web search (free result and "Więcej propozycji").
-- Complements 20261114020000_seed_allowed_shops.sql: books, games and toys, electronics, cosmetics,
-- home and kitchen, sport and outdoor, hobby and crafts, coffee and tea, experiences, gift cards.
-- Every domain answered over HTTPS when the list was prepared (2026-11-21). No marketplaces with private
-- listings and no auction sites.
--
-- Notes:
-- * ksiegarnia.pwn.pl, avans.pl and oleole.pl answered 403 to automated requests (bot protection):
--   the AI's web_fetch may be blocked there too. Set active = false if they never yield verified products.
-- * trefl.com, wittchen.com, reserved.com and ccc.eu are Polish companies with a Polish version of the shop,
--   but the domain is not .pl: the domain match covers every language version.
-- * For shops you have in an affiliate network set has_affiliate = true, network and deeplink_template
--   (with a {url} placeholder) later, as in the first seed.
-- Re-running is safe: existing domains are left unchanged.

insert into public.allowed_shops (domain, name, active, has_affiliate, deeplink_template, network) values
  -- Książki
  ('matras.pl',              'Matras',                 true, false, null, null),
  ('ksiegarnia.pwn.pl',      'Księgarnia PWN',         true, false, null, null),
  ('bookbook.pl',            'bookbook',               true, false, null, null),
  -- Gry i zabawki
  ('planszomania.pl',        'Planszomania',           true, false, null, null),
  ('trefl.com',              'Trefl',                  true, false, null, null),
  ('granna.pl',              'Granna',                 true, false, null, null),
  -- Elektronika
  ('avans.pl',               'Avans',                  true, false, null, null),
  ('oleole.pl',              'OleOle!',                true, false, null, null),
  ('sferis.pl',              'Sferis',                 true, false, null, null),
  -- Kosmetyki
  ('ezebra.pl',              'eZebra',                 true, false, null, null),
  ('e-glamour.pl',           'E-Glamour',              true, false, null, null),
  ('inglot.pl',              'Inglot',                 true, false, null, null),
  -- Dom i kuchnia
  ('agata.pl',               'Agata',                  true, false, null, null),
  ('dekoria.pl',             'Dekoria',                true, false, null, null),
  ('westwing.pl',            'Westwing',               true, false, null, null),
  -- Sport i outdoor
  ('skalnik.pl',             'Skalnik',                true, false, null, null),
  ('8a.pl',                  '8a.pl',                  true, false, null, null),
  ('sportano.pl',            'Sportano',               true, false, null, null),
  -- Hobby i rękodzieło
  ('wloczkowo.pl',           'Włóczkowo',              true, false, null, null),
  ('modelarnia.pl',          'Modelarnia',             true, false, null, null),
  ('sklepplastyczny.pl',     'Sklep Plastyczny',       true, false, null, null),
  -- Kawa i herbata
  ('konesso.pl',             'Konesso',                true, false, null, null),
  ('storycoffee.pl',         'Story Coffee Roasters',  true, false, null, null),
  ('czajnikowy.com.pl',      'Czajnikowy',             true, false, null, null),
  ('tea-shop.pl',            'Tea Shop',               true, false, null, null),
  -- Prezenty-przeżycia
  ('wyjatkowyprezent.pl',    'Wyjątkowy Prezent',      true, false, null, null),
  ('ebilet.pl',              'eBilet',                 true, false, null, null),
  -- Karty podarunkowe
  ('wittchen.com',           'Wittchen',               true, false, null, null),
  ('ccc.eu',                 'CCC',                    true, false, null, null),
  ('reserved.com',           'Reserved',               true, false, null, null)
on conflict (domain) do nothing;
