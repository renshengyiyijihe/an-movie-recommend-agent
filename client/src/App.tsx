import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import HomePage from '@/pages/HomePage';
import ToastHost from '@/components/ToastHost';

function App() {
  return (
    <BrowserRouter>
      <ToastHost />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
