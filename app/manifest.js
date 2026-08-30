export default function manifest() {
  return {
    name: "Aspen Kingfisher — River Hunt",
    short_name: "Kingfisher",
    description: "A cinematic kingfisher wildlife hunting game set on a living river.",
    start_url: "/",
    display: "fullscreen",
    background_color: "#06151a",
    theme_color: "#06151a",
    orientation: "any",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };
}
