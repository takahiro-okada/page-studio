import { fileURLToPath } from 'node:url';

// Add sites here. Each site's data and releases are isolated by its id.
export const sites = [{
  id: 'karen',
  name: 'Midlife Miracles',
  owner: 'Karen Dugdale',
  domain: 'midlife-miracles.com',
  root: fileURLToPath(new URL('../hypnotherapy/graduate-success-stories/karen-dugdale/test/', import.meta.url)),
  sourcePrefix: '/graduate-success-stories/karen-dugdale/test/',
  pages: [
    { id: 'home', label: 'Home', path: 'index.html', url: '/' },
    { id: 'about', label: 'About Karen', path: 'about-karen/index.html', url: '/about-karen/' },
    { id: 'shop', label: 'Shop', path: 'shop/index.html', url: '/shop/' }
  ]
}];
