import Document, { Html, Head, Main, NextScript } from "next/document";

const AD_ELIGIBLE_ROUTES = new Set(["/", "/posts/[post]", "/changelog"]);

function shouldServeAds(pathname) {
  return AD_ELIGIBLE_ROUTES.has(pathname);
}

class DigitBoxDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return {
      ...initialProps,
      serveAds: shouldServeAds(ctx.pathname),
    };
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="apple-touch-icon" href="/favicon.svg" />
          <meta name="theme-color" content="#0b1330" />
          {this.props.serveAds && (
            <script
              async
              src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2739531636775993"
              crossOrigin="anonymous"
            ></script>
          )}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default DigitBoxDocument;
