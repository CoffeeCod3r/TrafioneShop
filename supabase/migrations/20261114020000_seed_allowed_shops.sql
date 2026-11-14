-- Seed: trusted Polish shops for the paid web search ("Szukaj w całym internecie").
-- Only these domains are searched/fetched by the AI and accepted in results.
--
-- TODO before launch: for shops you have in affiliate networks set
--   has_affiliate = true, network = '<network>' and deeplink_template with a {url} placeholder,
-- e.g. 'https://www.awin1.com/cread.php?awinmid=12345&awinaffid=67890&ued={url}'.
-- The app URL-encodes the product URL before substituting {url}.
-- Re-running is safe: existing domains are left unchanged.

insert into public.allowed_shops (domain, name, active, has_affiliate, deeplink_template, network) values
  ('empik.com',            'Empik',            true, false, null, null),
  ('taniaksiazka.pl',      'TaniaKsiążka',     true, false, null, null),
  ('swiatksiazki.pl',      'Świat Książki',    true, false, null, null),
  ('bonito.pl',            'Bonito',           true, false, null, null),
  ('gandalf.com.pl',       'Gandalf',          true, false, null, null),
  ('rebel.pl',             'Rebel',            true, false, null, null),
  ('mediaexpert.pl',       'Media Expert',     true, false, null, null),
  ('euro.com.pl',          'RTV Euro AGD',     true, false, null, null),
  ('mediamarkt.pl',        'MediaMarkt',       true, false, null, null),
  ('x-kom.pl',             'x-kom',            true, false, null, null),
  ('morele.net',           'Morele',           true, false, null, null),
  ('komputronik.pl',       'Komputronik',      true, false, null, null),
  ('neonet.pl',            'Neonet',           true, false, null, null),
  ('decathlon.pl',         'Decathlon',        true, false, null, null),
  ('intersport.pl',        'Intersport',       true, false, null, null),
  ('4f.com.pl',            '4F',               true, false, null, null),
  ('sephora.pl',           'Sephora',          true, false, null, null),
  ('douglas.pl',           'Douglas',          true, false, null, null),
  ('notino.pl',            'Notino',           true, false, null, null),
  ('rossmann.pl',          'Rossmann',         true, false, null, null),
  ('hebe.pl',              'Hebe',             true, false, null, null),
  ('zalando.pl',           'Zalando',          true, false, null, null),
  ('answear.com',          'Answear',          true, false, null, null),
  ('modivo.pl',            'Modivo',           true, false, null, null),
  ('apart.pl',             'Apart',            true, false, null, null),
  ('wkruk.pl',             'W.Kruk',           true, false, null, null),
  ('smyk.com',             'Smyk',             true, false, null, null),
  ('castorama.pl',         'Castorama',        true, false, null, null),
  ('leroymerlin.pl',       'Leroy Merlin',     true, false, null, null),
  ('homeandyou.com',       'Home&You',         true, false, null, null),
  ('jysk.pl',              'JYSK',             true, false, null, null),
  ('tchibo.pl',            'Tchibo',           true, false, null, null),
  ('coffeedesk.pl',        'Coffeedesk',       true, false, null, null)
on conflict (domain) do nothing;
