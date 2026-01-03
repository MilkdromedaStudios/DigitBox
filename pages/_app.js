// digitbox/pages/_app.js
import "../styles/global.css";
import "../styles/login.css";
import Layout from "../components/Layout";

export default function MyApp({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
