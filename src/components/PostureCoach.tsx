"use client";
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
    <div className="bg-[#18181b] rounded-2xl border border-zinc-800 p-8 shadow-xl">
      <h2 className="text-2xl font-bold tracking-tight text-white text-center mb-2">Posture Comparison</h2>
      <p className="text-zinc-400 text-center mb-8">Upload a reference pose and your practice pose to get feedback.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Master Pose Upload */}
        <div className="flex flex-col items-center p-6 border-2 border-dashed border-zinc-700 bg-[#0f0f11] rounded-xl hover:border-amber-500 transition-colors group">
          <h3 className="font-semibold text-zinc-300 mb-4 tracking-wide">1. Reference Pose</h3>
          {masterPreview ? (
            <div className="relative w-full aspect-square mb-4">
              <img src={masterPreview} alt="Reference" className="w-full h-full object-cover rounded-lg shadow-inner" />
              <button onClick={() => { setMasterFile(null); setMasterPreview(null); }} className="absolute top-2 right-2 bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black hover:scale-110 transition-transform">✕</button>
            </div>
          ) : (
            <div className="w-full aspect-square bg-zinc-900 rounded-lg flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
              <span className="text-zinc-600 font-medium">No Image</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'master')} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 hover:file:text-white cursor-pointer text-zinc-400" />
        </div>

        {/* Student Pose Upload */}
        <div className="flex flex-col items-center p-6 border-2 border-dashed border-zinc-700 bg-[#0f0f11] rounded-xl hover:border-amber-500 transition-colors group">
          <h3 className="font-semibold text-zinc-300 mb-4 tracking-wide">2. Practice Pose</h3>
          {studentPreview ? (
            <div className="relative w-full aspect-square mb-4">
              <img src={studentPreview} alt="Practice" className="w-full h-full object-cover rounded-lg shadow-inner" />
              <button onClick={() => { setStudentFile(null); setStudentPreview(null); }} className="absolute top-2 right-2 bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black hover:scale-110 transition-transform">✕</button>
            </div>
          ) : (
            <div className="w-full aspect-square bg-zinc-900 rounded-lg flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
              <span className="text-zinc-600 font-medium">No Image</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'student')} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 hover:file:text-white cursor-pointer text-zinc-400" />
        </div>
      </div>

      <div className="flex flex-col items-center">
        <button 
          onClick={handleAnalyze} 
          disabled={!masterFile || !studentFile || loading}
          className="bg-zinc-100 text-black px-10 py-4 rounded-xl font-bold shadow-lg hover:bg-white transition-all disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed mb-6 hover:scale-105 active:scale-100 flex items-center gap-2"
        >
          {loading ? 'Analyzing with Qwen Vision AI...' : 'Analyze Form Alignment'}
        </button>

        {error && <p className="text-red-500 font-semibold mb-4 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">{error}</p>}
        
        {feedback && (
          <div className="w-full bg-[#0f0f11] border border-zinc-800 shadow-inner rounded-xl p-6 md:p-8 text-left mt-4">
            <h3 className="text-white text-xl font-bold mb-6 border-b border-zinc-800 pb-4 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              Expert Feedback
            </h3>
            <div className="text-zinc-300 leading-relaxed text-base space-y-4">
              <ReactMarkdown
                components={{
                  p: ({node, ...props}) => <p className="mb-4 text-zinc-400" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-zinc-200" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2 text-zinc-400" {...props} />,
                  li: ({node, ...props}) => <li className="" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-xl font-bold text-white mt-8 mb-4 tracking-tight" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold text-zinc-200 mt-6 mb-3" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-md font-bold text-zinc-300 mt-5 mb-2 uppercase tracking-wide text-xs" {...props} />,
                }}
              >
                {feedback}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
