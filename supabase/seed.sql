insert into public.blog_posts (title, slug, excerpt, content, category, read_minutes, is_published, published_at)
values
(
  'Perdre du poids sans frustration',
  'perdre-du-poids-sans-frustration',
  '3 leviers simples pour perdre du poids durablement sans regime extreme.',
  'Concentre-toi sur la regularite: 1) Proteines a chaque repas, 2) 8 000 a 10 000 pas par jour, 3) 80 pourcent de repas simples et peu transformes. Le but est de tenir 6 mois, pas 6 jours.',
  'Perte de poids',
  4,
  true,
  now()
),
(
  'Le vrai role du petit-dejeuner',
  'role-petit-dejeuner',
  'Le petit-dejeuner n est pas obligatoire pour tout le monde, mais il peut t aider.',
  'Si tu as faim le matin, prends un repas riche en proteines et fibres. Si tu n as pas faim, inutile de forcer. Le meilleur plan est celui que tu peux reproduire chaque semaine.',
  'Nutrition',
  3,
  true,
  now()
),
(
  'Comment gerer les ecarts du week-end',
  'gerer-ecarts-weekend',
  'Tu peux sortir le week-end sans ruiner tes progres.',
  'Avant une sortie, garde des repas legers et proteines dans la journee. Pendant la sortie, mange lentement et choisis ce qui te fait vraiment plaisir. Le lendemain: hydratation, marche, retour au plan normal sans culpabilite.',
  'Habitudes',
  5,
  true,
  now()
)
on conflict (slug) do update
set title = excluded.title,
    excerpt = excluded.excerpt,
    content = excluded.content,
    category = excluded.category,
    read_minutes = excluded.read_minutes,
    is_published = excluded.is_published,
    published_at = excluded.published_at,
    updated_at = now();
