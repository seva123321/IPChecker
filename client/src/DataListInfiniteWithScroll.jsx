import React from 'react'
import withInfiniteScroll from './hoc/withInfiniteScroll'

const InfiniteList = ({ items, render, loadMoreData, hasMore }) => {
  return (
    <>
      {items.map((item, index) => (
        <div key={index}>{render(item)}</div>
      ))}
      {!hasMore && <div>Нет больше данных</div>}
    </>
  );
};

export default withInfiniteScroll(InfiniteList);

// import { withInfiniteScroll } from './hoc/withInfiniteScroll'
// // import { MainPageInfinite } from './MainPageInfinite'
// import { MainPage } from './MainPage'

// // Обертка для MainPage с бесконечной прокруткой
// export const MainPageInfiniteWithScroll = withInfiniteScroll(
//   MainPage,
//   'items'
// )
