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
          <div className="w-full bg-white border border-gray-200 shadow-sm rounded-xl p-6 md:p-8 text-left mt-4">
            <h3 className="text-black text-xl font-bold mb-6 border-b border-gray-100 pb-4">
              Posture Analysis
            </h3>
            <div className="text-gray-800 leading-relaxed text-base space-y-4">
              <ReactMarkdown
                components={{
                  p: ({node, ...props}) => <p className="mb-4" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-black" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
                  li: ({node, ...props}) => <li className="" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-xl font-bold text-black mt-6 mb-3" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold text-black mt-5 mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-md font-bold text-black mt-4 mb-2" {...props} />,
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
