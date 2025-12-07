import withInfiniteScroll from './hoc/withInfiniteScroll'

const InfiniteList = ({ items, render, hasMore }) => {
  console.log('InfiniteList')

  const data = items[0]?.items ?? items 
console.log('data > ', data)
  return (
    <>
      {data.map((item, index) => (
        <div key={index}>{render(item)}</div>
      ))}
      {!hasMore && data.length > 0 && (
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
