import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // setTimeout ensures the DOM has painted the new page before scrolling.
    // This fixes mobile browser issues where the page doesn't scroll to top on click.
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, 0);
  }, [pathname]);

  return null;
}
