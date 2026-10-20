import Head from "next/head";
import Icon from "../components/Icon";
import { PostCard } from "../components/Cards";
import { POSTS } from "../lib/catalog";

export default function PostsPage() {
  return (
    <>
      <Head>
        <title>Community - DigitBox</title>
        <meta name="description" content="News, updates and notes from the DigitBox community." />
      </Head>

      <div className="hub-page">
        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">COMMUNITY</span>
            <h1>Community posts</h1>
            <p>News about new videos and cloud games, plus notes from behind the scenes.</p>
          </div>
        </div>

        {POSTS.length > 0 ? (
          <div className="hub-grid hub-grid-posts">
            {POSTS.map((post) => <PostCard key={post.key} post={post} />)}
          </div>
        ) : (
          <div className="hub-empty"><Icon name="posts" /><h3>No posts yet</h3><p>Community posts will appear here.</p></div>
        )}
      </div>
    </>
  );
}
