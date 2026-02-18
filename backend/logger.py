import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

class RAGLogger:
    def __init__(self, log_dir: str = "backend/logs", max_entries: int = 90):
        """Initialize the RAG logger with a single rotating log file."""
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        self.max_entries = max_entries
        
        # Single log file for all entries
        self.log_file = self.log_dir / "rag_logs.json"
        
        # Initialize log file if it doesn't exist
        if not self.log_file.exists():
            with open(self.log_file, 'w') as f:
                json.dump([], f)
    
    def _rotate_logs_if_needed(self):
        """Check if log rotation is needed and perform it."""
        try:
            if not self.log_file.exists():
                return
                
            with open(self.log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
            
            if len(logs) >= self.max_entries:
                # Keep only the most recent entries (remove oldest)
                logs = logs[-(self.max_entries - 1):]  # Keep 89 entries to make room for 1 new
                
                # Write back the trimmed logs
                with open(self.log_file, 'w', encoding='utf-8') as f:
                    json.dump(logs, f, indent=2, ensure_ascii=False)
                    
        except Exception as e:
            print(f"Error during log rotation: {e}")
    
    def log_chat_interaction(
        self, 
        session_id: str,
        question: str, 
        answer: str, 
        sources: List[Dict] = None,
        metadata: Dict[str, Any] = None,
        response_time: float = None,
        use_kb: bool = False,
        has_session_file: bool = False
    ):
        """Log a complete chat interaction with all relevant details."""
        # Check if rotation is needed before adding new entry
        self._rotate_logs_if_needed()
        
        timestamp = datetime.now()
        
        # Prepare metadata
        log_metadata = {
            "session_id": session_id,
            "timestamp": timestamp.isoformat(),
            "response_time_seconds": response_time,
            "use_knowledge_base": use_kb,
            "has_session_file": has_session_file,
            "sources_count": len(sources) if sources else 0,
            "question_length": len(question),
            "answer_length": len(answer)
        }
        
        if metadata:
            log_metadata.update(metadata)
        
        # Create unified log entry
        log_entry = {
            "type": "chat_interaction",
            "session_id": session_id,
            "timestamp": timestamp.isoformat(),
            "question": question,
            "answer": answer,
            "sources": sources or [],
            "metadata": log_metadata
        }
        
        # Append to single log file
        self._append_log_entry(log_entry)
    
    def _append_log_entry(self, entry: Dict):
        """Safely append entry to the single log file."""
        try:
            # Read existing logs
            if self.log_file.exists():
                with open(self.log_file, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            else:
                logs = []
            
            # Append new entry
            logs.append(entry)
            
            # Write back to file
            with open(self.log_file, 'w', encoding='utf-8') as f:
                json.dump(logs, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            print(f"Failed to append log entry: {e}")
    
    def log_system_event(self, event_type: str, message: str, level: str = "INFO", **kwargs):
        """Log system events like errors, warnings, etc."""
        # Check if rotation is needed before adding new entry
        self._rotate_logs_if_needed()
        
        timestamp = datetime.now()
        
        log_entry = {
            "type": "system_event",
            "timestamp": timestamp.isoformat(),
            "event_type": event_type,
            "level": level.upper(),
            "message": message,
            "data": kwargs
        }
        
        # Append to single log file
        self._append_log_entry(log_entry)
    
    def log_document_ingestion(self, session_id: str, filename: str, num_clauses: int, success: bool = True, error: str = None):
        """Log document ingestion events."""
        self.log_system_event(
            "DOCUMENT_INGESTION",
            f"{'Success' if success else 'Failed'}: {filename}",
            level="INFO" if success else "ERROR",
            session_id=session_id,
            filename=filename,
            num_clauses=num_clauses,
            success=success,
            error=error
        )
    
    def log_compliance_analysis(self, session_id: str, assessment_id: int, num_comparisons: int, success: bool = True):
        """Log compliance analysis events."""
        self.log_system_event(
            "COMPLIANCE_ANALYSIS",
            f"Assessment {assessment_id} with {num_comparisons} comparisons",
            session_id=session_id,
            assessment_id=assessment_id,
            num_comparisons=num_comparisons,
            success=success
        )
    
    def get_chat_history(self, session_id: str = None, limit: int = 100) -> List[Dict]:
        """Retrieve chat history, optionally filtered by session."""
        try:
            if not self.log_file.exists():
                return []
            
            with open(self.log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
            
            # Filter for chat interactions only
            chat_logs = [log for log in logs if log.get('type') == 'chat_interaction']
            
            if session_id:
                chat_logs = [log for log in chat_logs if log.get('session_id') == session_id]
            
            # Return most recent entries first
            return sorted(chat_logs, key=lambda x: x['timestamp'], reverse=True)[:limit]
            
        except Exception as e:
            print(f"Failed to retrieve chat history: {e}")
            return []
    
    def get_session_stats(self, session_id: str) -> Dict:
        """Get statistics for a specific session."""
        history = self.get_chat_history(session_id)
        
        if not history:
            return {"total_interactions": 0}
        
        total_questions = len(history)
        avg_question_length = sum(len(h['question']) for h in history) / total_questions if total_questions > 0 else 0
        avg_answer_length = sum(len(h['answer']) for h in history) / total_questions if total_questions > 0 else 0
        
        # Calculate average response time
        response_times = [
            h['metadata'].get('response_time_seconds', 0) 
            for h in history 
            if h.get('metadata', {}).get('response_time_seconds')
        ]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        return {
            "session_id": session_id,
            "total_interactions": total_questions,
            "average_question_length": round(avg_question_length, 1),
            "average_answer_length": round(avg_answer_length, 1),
            "average_response_time": round(avg_response_time, 2),
            "first_interaction": history[-1]['timestamp'] if history else None,
            "last_interaction": history[0]['timestamp'] if history else None
        }
    
    def get_all_logs(self, limit: int = 100) -> List[Dict]:
        """Get all logs (both chat and system events)."""
        try:
            if not self.log_file.exists():
                return []
            
            with open(self.log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
            
            # Return most recent entries first
            return sorted(logs, key=lambda x: x['timestamp'], reverse=True)[:limit]
            
        except Exception as e:
            print(f"Failed to retrieve all logs: {e}")
            return []
    
    def cleanup_old_logs(self, days_to_keep: int = 30):
        """This method is now handled automatically by rotation, but kept for compatibility."""
        # Since we're using entry-based rotation (90 entries max), 
        # this method will just perform a manual rotation check
        self._rotate_logs_if_needed()
        print(f"Log rotation check completed. Maximum {self.max_entries} entries maintained.")

# Global logger instance
rag_logger = RAGLogger()
