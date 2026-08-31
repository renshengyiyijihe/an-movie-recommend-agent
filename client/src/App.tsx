import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import HomePage from '@/pages/HomePage';
import ToastHost from '@/components/ToastHost';
import { ROUTE } from '@/constant';

function App() {
  return (
    <BrowserRouter>
      <ToastHost />
      <ErrorBoundary>
        {/*
          两条路由挂同一个 <HomePage />，react-router 复用同一个实例，
          首条消息发完后 navigate 到 /chat/:id 不会重挂载、气泡不会丢。
        */}
        <Routes>
          <Route path={ROUTE.home} element={<HomePage />} />
          <Route path={ROUTE.chatDetail} element={<HomePage />} />
          <Route path="*" element={<Navigate to={ROUTE.home} replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
