/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker runtime stage.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
