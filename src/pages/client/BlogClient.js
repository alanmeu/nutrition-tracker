import React, { useEffect, useMemo, useState } from "react";

const BLOG_FAVORITES_KEY = "nutrition_tracker_blog_favorites_v1";

export default function BlogClient({ posts }) {
  const items = useMemo(
    () => (Array.isArray(posts) ? posts.filter((post) => post.isPublished !== false) : []),
    [posts]
  );
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BLOG_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setFavoriteIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BLOG_FAVORITES_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  const categories = useMemo(() => {
    const values = Array.from(
      new Set(items.map((post) => post.category || "Astuces").filter(Boolean))
    );
    return values.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((post) => {
      const category = post.category || "Astuces";
      const matchCategory = selectedCategory === "all" || category === selectedCategory;
      if (!matchCategory) return false;
      if (!normalizedQuery) return true;
      const haystack = `${post.title || ""} ${post.excerpt || ""} ${post.content || ""} ${category}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query, selectedCategory]);

  const recommendedItems = useMemo(() => {
    const favorites = items.filter((post) => favoriteIds.includes(post.id));
    const favoriteCategories = new Set(favorites.map((post) => post.category || "Astuces"));

    const basedOnFavorites = items.filter(
      (post) =>
        !favoriteIds.includes(post.id) &&
        favoriteCategories.size > 0 &&
        favoriteCategories.has(post.category || "Astuces")
    );

    const source = basedOnFavorites.length ? basedOnFavorites : items.filter((post) => !favoriteIds.includes(post.id));
    return source.slice(0, 3);
  }, [items, favoriteIds]);

  const toggleFavorite = (postId) => {
    setFavoriteIds((prev) =>
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    );
  };

  return (
    <section className="dashboard-grid blog-page">
      <section className="panel panel-highlight">
        <div className="row-between">
          <div>
            <p className="eyebrow">Nutrition Cloud</p>
            <h3>Blog & Astuces</h3>
          </div>
        </div>
        <p className="info-text">
          Conseils pratiques pour perdre du poids durablement sans approche medicale stricte.
        </p>
      </section>

      <section className="panel">
        <div className="blog-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un article..."
            aria-label="Rechercher un article"
          />
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            aria-label="Filtrer par categorie"
          >
            <option value="all">Toutes les categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {recommendedItems.length ? (
          <section className="blog-reco">
            <h4>Pour vous</h4>
            <div className="blog-reco-list">
              {recommendedItems.map((post) => (
                <button
                  key={`reco-${post.id}`}
                  type="button"
                  className="blog-reco-item"
                  onClick={() => {
                    setQuery(post.title || "");
                    setSelectedCategory(post.category || "all");
                  }}
                >
                  {post.title}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!filteredItems.length ? <p>Aucun article ne correspond a votre recherche.</p> : null}
        <div className="blog-grid">
          {filteredItems.map((post) => (
            <article key={post.id} className="blog-card">
              {post.coverImageUrl ? (
                <img className="blog-cover" src={post.coverImageUrl} alt={post.title} loading="lazy" decoding="async" />
              ) : null}
              <div className="blog-card-body">
                <div className="blog-card-top">
                  <span className="blog-chip">{post.category || "Astuces"}</span>
                  <div className="blog-card-actions">
                    <small>{post.readMinutes || 4} min</small>
                    <button
                      type="button"
                      className={`blog-favorite ${favoriteIds.includes(post.id) ? "is-active" : ""}`}
                      onClick={() => toggleFavorite(post.id)}
                      aria-label={favoriteIds.includes(post.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                    >
                      {favoriteIds.includes(post.id) ? "Favori" : "Favoris"}
                    </button>
                  </div>
                </div>
                <h4>{post.title}</h4>
                {post.excerpt ? <p>{post.excerpt}</p> : null}
                <small className="blog-date">
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}
                </small>
                {post.content ? (
                  <details className="blog-details">
                    <summary>Lire l'article</summary>
                    <p>{post.content}</p>
                  </details>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
