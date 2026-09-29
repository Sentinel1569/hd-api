export const Platform = { OS: 'android' };

/** URLs the code under test tried to open, newest last. */
export const openedUrls = [];
export const Linking = {
  async openURL(url) {
    openedUrls.push(url);
  },
};
