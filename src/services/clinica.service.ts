import { Clinica } from "@/types";
import { apiFetch } from "./api";

class ClinicaService {

    async list(userId: number) {

        try {
            const response = await apiFetch('/clinics/user/' + userId)
            return {
                success: true,
                message: "Carga correcta",
                data: await response.json()
            }
        } catch (error) {
            return {
                success: false,
                message: "Problemas para cargar clinicas"
            }
        }


    }

    async create(clinica: Clinica) {
        console.log(clinica)
        try {
            const url = clinica.clinicaId ? `/clinics/${clinica.clinicaId}/` : '/clinics'
            const response = await apiFetch(url, {
                method: clinica.clinicaId ? 'PUT' : 'POST',
                body: JSON.stringify(clinica)
            })
            return {
                success: true,
                message: "Clinica creada exitosamente",
                data: await response.json()
            }
        } catch (error) {
            return {
                success: false,
                message: "Problemas para crear clinica, favor verificar los datos ingresados"
            }
        }
    }

    async delete(id: number) {
        const response = await apiFetch(`/clinics/${id}/`, {
            method: 'DELETE',
        })
        return {
            success: response.ok,
            message: response.ok ? "Clinica eliminada exitosamente" : "No se pudo eliminar la clinica",
            data: []
        }
    }
}
export const clinicaService = new ClinicaService()