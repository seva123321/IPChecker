import withInfiniteScroll from './hoc/withInfiniteScroll'

const InfiniteList = ({ items, render, hasMore }) => {
  return (
    <>
      {items.map((item, index) => (
        <div key={index}>{render(item)}</div>
      ))}
      {!hasMore && items.length > 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '20px',
            color: '#8c8c8c',
            borderTop: '1px solid #f0f0f0',
            marginTop: '20px',
          }}
        >
          Все данные загружены
        </div>
      )}
    </>
  )
}

export default withInfiniteScroll(InfiniteList)

// import withInfiniteScroll from './hoc/withInfiniteScroll'

// const InfiniteList = ({ items, render, hasMore, isLoading }) => {
//   return (
//     <>
//       {items.map((item, index) => (
//         <div key={item.id || index}>{render(item)}</div>
//       ))}

//       {/* Показываем индикатор загрузки */}
//       {isLoading && (
//         <div
//           style={{
//             textAlign: 'center',
//             padding: '20px',
//             color: '#8c8c8c',
//           }}
//         >
//           Загрузка...
//         </div>
//       )}

//       {/* Сообщение когда данные закончились */}
//       {!hasMore && items.length > 0 && (
//         <div
//           style={{
//             textAlign: 'center',
//             padding: '20px',
//             color: '#8c8c8c',
//             borderTop: '1px solid #f0f0f0',
//             marginTop: '20px',
//           }}
//         >
//           Все данные загружены
//         </div>
//       )}
//     </>
//   )
// }

// export default withInfiniteScroll(InfiniteList)
