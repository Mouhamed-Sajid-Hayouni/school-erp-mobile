import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ CHANGE THIS TO YOUR LAPTOP'S IP ADDRESS!
const API_URL = 'https://school-erp-api-3l16.onrender.com';

export default function App() {
  const [email, setEmail] = useState('');
  const[password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [portalData, setPortalData] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');
    setIsLoggingIn(true);
    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('role', data.role);
        setUserRole(data.role);
        setIsLoggedIn(true); 
      } else {
        Alert.alert('Login Failed', data.error || 'Invalid credentials');
      }
    } catch (error) {
      Alert.alert('Network Error', 'Cannot connect to server. Check your IP address!');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('role');
    setPortalData(null);
    setIsLoggedIn(false);
  };

  useEffect(() => {
    if (isLoggedIn) fetchMyData();
  }, [isLoggedIn]);

  const fetchMyData = async () => {
    setIsLoadingData(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/my-portal`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!data.error) setPortalData(data);
    } catch (error) {
      Alert.alert("Error", "Failed to load your school data.");
    } finally {
      setIsLoadingData(false);
    }
  };

  // --- RENDER STUDENT DATA ---
  const renderStudentView = (student: any) => {
  const fullName =
    `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim() ||
    "Student";

  const className = student?.class?.name || "No Class";
  const schedules = student?.class?.schedules ?? [];
  const grades = student?.grades ?? [];
  const attendances = student?.attendances ?? [];
  const absences = attendances.filter((a: any) => a?.status === "ABSENT");

  return (
    <View key={student?.id ?? fullName} style={styles.studentSection}>
      <View style={styles.studentHeader}>
        <Text style={styles.studentName}>{fullName}</Text>
        <View style={styles.classBadge}>
          <Text style={styles.classBadgeText}>{className}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>🗓️ Weekly Timetable</Text>
      {!student?.class || schedules.length === 0 ? (
        <Text style={styles.emptyText}>No classes scheduled yet.</Text>
      ) : (
        <View style={styles.scheduleContainer}>
          {schedules.map((sched: any) => {
            const teacherLastName =
              sched?.teacher?.user?.lastName ??
              sched?.teacher?.user?.firstName ??
              "Teacher";

            return (
              <View key={sched?.id ?? `${sched?.dayOfWeek}-${sched?.startTime}`} style={styles.scheduleCard}>
                <View style={styles.scheduleDayTime}>
                  <Text style={styles.scheduleDay}>{sched?.dayOfWeek ?? "-"}</Text>
                  <Text style={styles.scheduleTime}>
                    {sched?.startTime ?? "-"} - {sched?.endTime ?? "-"}
                  </Text>
                </View>
                <View style={styles.scheduleDetails}>
                  <Text style={styles.subjectName}>{sched?.subject?.name ?? "Subject"}</Text>
                  <Text style={styles.teacherName}>Prof. {teacherLastName}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 25 }]}>📚 Recent Grades</Text>
      {grades.length === 0 ? (
        <Text style={styles.emptyText}>No grades published yet.</Text>
      ) : (
        grades.map((g: any) => (
          <View key={g?.id ?? `${g?.subject?.name}-${g?.examType}`} style={styles.gradeCard}>
            <View>
              <Text style={styles.subjectName}>{g?.subject?.name ?? "Subject"}</Text>
              <Text style={styles.examType}>{g?.examType ?? "-"}</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{g?.score ?? "-"}/20</Text>
            </View>
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>⚠️ Absences</Text>
      {absences.length === 0 ? (
        <Text style={styles.emptyText}>Perfect attendance! 🎉</Text>
      ) : (
        absences.map((a: any) => (
          <View key={a?.id ?? `${a?.date}-${a?.status}`} style={styles.absenceCard}>
            <Text style={styles.absenceSubject}>
              {a?.schedule?.subject?.name ?? "Subject"}
            </Text>
            <Text style={styles.absenceDate}>
              {a?.date ? new Date(a.date).toLocaleDateString() : "-"}
            </Text>
          </View>
        ))
      )}
    </View>
  );
};

  if (isLoggedIn) {
    return (
      <View style={styles.dashboardContainer}>
        <View style={styles.navbar}>
          <Text style={styles.navTitle}>My School</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {isLoadingData || !portalData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading your data...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {userRole === 'STUDENT' && renderStudentView(portalData as any)}
            {userRole === 'PARENT' && (
              <View>
                <Text style={styles.parentWelcome}>Welcome to the Parent Portal</Text>
                {(portalData as any)?.children?.length === 0 ? (
                  <Text style={styles.emptyText}>No children linked to your account.</Text>
                ) : (
                  ((portalData as any)?.children ?? []).map((child: any) => renderStudentView(child))
                  )}
                  </View>
                )}
            <View style={{ height: 50 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.loginBox}>
        <Text style={styles.title}>School ERP</Text>
        <Text style={styles.subtitle}>Mobile Portal</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput style={styles.input} placeholder="student@school.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoggingIn}>
          {isLoggingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- BEAUTIFUL MOBILE CSS STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', justifyContent: 'center', padding: 20 },
  loginBox: { backgroundColor: '#fff', padding: 24, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2563eb', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 30 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 15, fontSize: 16 },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  dashboardContainer: { flex: 1, backgroundColor: '#f3f4f6', paddingTop: 50 },
  navbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  navTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutBtnText: { color: '#dc2626', fontWeight: 'bold' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#6b7280', fontSize: 16 },
  scrollArea: { padding: 20 },
  parentWelcome: { fontSize: 18, fontWeight: 'bold', color: '#4b5563', marginBottom: 20, textAlign: 'center' },
  
  studentSection: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  studentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 15 },
  studentName: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  classBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  classBadgeText: { color: '#1d4ed8', fontWeight: 'bold', fontSize: 12 },
  
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 15 },
  emptyText: { color: '#9ca3af', fontStyle: 'italic' },
  
  // NEW TIMETABLE STYLES
  scheduleContainer: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 2, borderWidth: 1, borderColor: '#f1f5f9' },
  scheduleCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 4, alignItems: 'center' },
  scheduleDayTime: { width: 90, borderRightWidth: 1, borderRightColor: '#e2e8f0', paddingRight: 10, marginRight: 10 },
  scheduleDay: { fontSize: 14, fontWeight: 'bold', color: '#4f46e5' },
  scheduleTime: { fontSize: 12, color: '#64748b', marginTop: 4 },
  scheduleDetails: { flex: 1 },
  teacherName: { fontSize: 13, color: '#64748b', marginTop: 2 },

  gradeCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  subjectName: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  examType: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  scoreBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scoreText: { color: '#166534', fontWeight: 'bold', fontSize: 16 },

  absenceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fef2f2', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#fee2e2' },
  absenceSubject: { fontSize: 16, fontWeight: 'bold', color: '#991b1b' },
  absenceDate: { fontSize: 14, color: '#dc2626', fontWeight: '500' }
});