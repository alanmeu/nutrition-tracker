import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, GhostButton, Screen, Title } from "../../components/ui";
import { listPublishedBlogPosts } from "../../lib/api";
import type { BlogPost } from "../../types/models";

export function BlogScreen() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [error, setError] = useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const rows = await listPublishedBlogPosts();
        setPosts(rows);
      } catch (err: any) {
        setError(err?.message || "Impossible de charger le blog.");
      }
    })();
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>Blog & Astuces</Title>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!posts.length ? <Text style={styles.hint}>Aucun article publie.</Text> : null}
        </Card>

        {posts.map((post) => (
          <Card key={post.id}>
            {post.coverImageUrl ? <Image source={{ uri: post.coverImageUrl }} style={styles.cover} /> : null}
            <Text style={styles.chip}>{post.category}</Text>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.excerpt}>{post.excerpt || ""}</Text>
            <Text style={styles.date}>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("fr-FR") : ""}</Text>
            <Text style={styles.body}>{post.content}</Text>
            <GhostButton label={`${post.readMinutes} min`} onPress={() => {}} />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 12 },
  error: { color: "#b4232f" },
  hint: { color: "#5f738e" },
  cover: { width: "100%", height: 180, borderRadius: 10, backgroundColor: "#e8eef6" },
  chip: { color: "#0f766e", fontWeight: "700" },
  title: { fontWeight: "700", color: "#142b45", fontSize: 18 },
  excerpt: { color: "#4c637f" },
  date: { color: "#7b8ea7", fontSize: 12 },
  body: { color: "#2f4561" }
});
