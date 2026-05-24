import "../styles/global.css";
import "../styles/login.css";
import Layout from "../components/Layout";

export default function MyApp({ Component, pageProps, router }) {
  if (router?.pathname?.startsWith("/projects/")) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
