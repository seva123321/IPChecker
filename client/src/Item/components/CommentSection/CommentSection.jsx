import { InfoCircleOutlined } from '@ant-design/icons'
import cn from './CommentSection.module.scss'

export const CommentSection = ({ comment }) => {
  if (!comment) return null

  return (
    <div className={cn.commentSection}>
      <div className={cn.sectionHeader}>
        <InfoCircleOutlined />
        <span className={cn.sectionTitle}>Комментарий</span>
      </div>
      <div className={cn.commentText}>{comment}</div>
    </div>
  )
}
