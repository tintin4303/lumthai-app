"use client";
import React, { useState } from 'react';

export default function PostureCoach() {
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [masterPreview, setMasterPreview] = useState<string | null>(null);
  const [studentPreview, setStudentPreview] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'master' | 'student') => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const previewUrl = URL.createObjectURL(file);
      if (type === 'master') {
        setMasterFile(file);
        setMasterPreview(previewUrl);
      } else {
        setStudentFile(file);
        setStudentPreview(previewUrl);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!masterFile || !studentFile) {
        setError("Please upload both a Reference Pose and a Practice Pose.");
        return;
    }
    setLoading(true);
    setError(null);
    setFeedback(null);

    const formData = new FormData();
    formData.append("user_image", studentFile);
    formData.append("master_image", masterFile);

    try {
        const res = await fetch('/api/analyze-pose', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to analyze pose.");
        
        setFeedback(data.feedback);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-center mb-2">Posture Comparison</h2>
      <p className="text-gray-500 text-center mb-8">Upload a reference pose and your practice pose to get feedback.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Master Pose Upload */}
        <div className="flex flex-col items-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-black transition-colors">
          <h3 className="font-semibold mb-4">1. Reference Pose</h3>
          {masterPreview ? (
            <div className="relative w-full aspect-square mb-4">
              <img src={masterPreview} alt="Reference" className="w-full h-full object-cover rounded-lg" />
              <button onClick={() => { setMasterFile(null); setMasterPreview(null); }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black">×</button>
            </div>
          ) : (
            <div className="w-full aspect-square bg-gray-50 rounded-lg flex items-center justify-center mb-4">
              <span className="text-gray-400">No Image</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'master')} className="text-sm w-full" />
        </div>

        {/* Student Pose Upload */}
        <div className="flex flex-col items-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-black transition-colors">
          <h3 className="font-semibold mb-4">2. Practice Pose</h3>
          {studentPreview ? (
            <div className="relative w-full aspect-square mb-4">
              <img src={studentPreview} alt="Practice" className="w-full h-full object-cover rounded-lg" />
              <button onClick={() => { setStudentFile(null); setStudentPreview(null); }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black">×</button>
            </div>
          ) : (
            <div className="w-full aspect-square bg-gray-50 rounded-lg flex items-center justify-center mb-4">
              <span className="text-gray-400">No Image</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'student')} className="text-sm w-full" />
        </div>
      </div>

      <div className="flex flex-col items-center">
        <button 
          onClick={handleAnalyze} 
          disabled={loading || !masterFile || !studentFile}
          className="bg-black text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-6"
        >
          {loading ? "Comparing..." : "Compare Posture"}
        </button>

        {error && <p className="text-red-500 font-semibold mb-4">{error}</p>}
        
        {feedback && (
          <div className="w-full bg-green-50 border border-green-200 rounded-xl p-6 text-left">
            <h3 className="text-green-800 font-bold mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Feedback
            </h3>
            <p className="text-gray-800 whitespace-pre-wrap">{feedback}</p>
          </div>
        )}
      </div>
    </div>
  );
}
