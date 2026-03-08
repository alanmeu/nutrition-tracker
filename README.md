# Nutrition Tracker (Supabase)

Application React coach/client avec:
- Auth Supabase (signup/signin)
- Coach proprietaire unique
- Donnees cloud (profils, poids, bilans)
- Archivage + suppression client avec conservation historique

## 1) Variables d'environnement

Cree `.env`:

```bash
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=YOUR_ANON_KEY
REACT_APP_OWNER_COACH_EMAIL=meurisse.alan@gmail.com
REACT_APP_SITE_URL=http://localhost:3000
REACT_APP_STRIPE_PRICE_ID=price_xxxxx
REACT_APP_STRIPE_SUCCESS_URL=http://localhost:3000
REACT_APP_STRIPE_CANCEL_URL=http://localhost:3000
```

## 2) SQL Supabase

Execute `supabase/schema.sql` dans SQL Editor.

## 3) SMTP + confirmation email

Supabase:
1. `Authentication` -> `Providers` -> `Email`
2. Active `Confirm email`
3. `Authentication` -> `Settings` -> `SMTP Settings`
4. Configure un SMTP (resend/sendgrid/mailgun...)
5. Sauvegarde et teste "resend confirmation email" depuis l'ecran login

## 4) Run

```bash
npm install
npm start
```

## 5) Paiement Stripe (abonnement client)

1. Deploy les Edge Functions:
   - `create-stripe-checkout`
   - `create-stripe-portal`
   - `stripe-webhook`
2. Ajoute les secrets Edge Functions:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Dans Stripe, cree un produit abonnement et recupere son `price_id`.
4. Mets `REACT_APP_STRIPE_PRICE_ID` dans `.env`, puis redemarre `npm start`.
5. Cree le webhook Stripe vers:
   - `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
6. Active au minimum ces events webhook:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. Important:
   - pour `stripe-webhook`, desactive la verification JWT dans la page de la function (Stripe n'envoie pas de token Supabase).

## Fonctionnalites coach

- Voir tous les clients
- Modifier deficit/message
- Generer bilan PDF
- `Archiver + Supprimer`:
  - archive snapshot profil + poids + rapports
  - supprime le client actif

## Validation

```bash
npm test -- --watch=false
npm run build
```
