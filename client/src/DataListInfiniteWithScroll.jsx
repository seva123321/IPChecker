import withInfiniteScroll from './hoc/withInfiniteScroll'

const InfiniteList = ({ items, render, hasMore }) => {
  const data = items[0]?.items ?? items
  // const data = reportData.items ?? items

  return (
    <>
      {data.map((item, index) => (
        <div key={index}>{render(item)}</div>
      ))}
      {!hasMore && data.length && (
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


