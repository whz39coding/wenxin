import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import UploadPage from './pages/Upload';
import OCRPage from './pages/OCR';
import RestorePage from './pages/Restore';
import SearchPage from './pages/Search';
import ExhibitionPage from './pages/Exhibition';
import ProfilePage from './pages/Profile';
import AuthPage from './pages/Auth';
import CinematicInkIntro from './components/CinematicInkIntro';
import { useRef } from 'react';
export default function App() {
  const uiRootRef = useRef<HTMLDivElement>(null);
  return (
    <Router>
      {/* <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/ocr" element={<OCRPage />} />
          <Route path="/restore" element={<RestorePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/exhibition" element={<ExhibitionPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout> */}
      <div ref={uiRootRef}>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/ocr" element={<OCRPage />} />
            <Route path="/restore" element={<RestorePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/exhibition" element={<ExhibitionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </div>
      <CinematicInkIntro uiRootRef={uiRootRef} />
    </Router>
  );
}
