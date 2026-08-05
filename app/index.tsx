// 根路由：重定向到今日页

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/today" />;
}
