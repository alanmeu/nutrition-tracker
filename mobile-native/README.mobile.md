# NutriCoach Pro Mobile (Expo)

## Prerequis
- Node.js 18+
- Expo Go sur smartphone

## Installation
```bash
cd mobile-native
cp .env.example .env
# remplir les variables Supabase
npm install
```

## Lancer
```bash
cd mobile-native
npm run start
```

Puis scanner le QR avec Expo Go.

## Variables env
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_OWNER_COACH_EMAIL`

## Fonctionnalites incluses
- Auth (connexion / creation)
- Role client / coach
- Client:
  - Bilan nutrition + edition profil
  - Recherche aliments Open Food Facts
  - Scan code-barres natif (`expo-camera`)
  - Ajout/suppression journal alimentaire du jour
  - Rendez-vous: reservation + annulation + slots indisponibles
- Coach:
  - Liste clients
  - Detail alimentaire journalier + hebdo
  - Liste rendez-vous du client

## Notes
- Les regles 1 rdv/semaine/client et creneau unique sont appliquees cote base (constraints/policies Supabase).
- Si le scanner ne lit pas un code-barres, verifier la nettete/lumiere et tester un EAN-13 classique.
